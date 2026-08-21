import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { analyseDocuments } from "@/features/ai/providers/mock-analysis";
import { verifyFindings, type AnalysisDocument } from "@/features/ai/verify-findings";
import { orderByRole } from "@/features/ai/build-input";
import { findParser } from "@/features/documents/parsers";
import { isAnalyzableFileType } from "@/lib/documents";
import type { DocumentRole } from "@/types/database";

/**
 * Proef op het echte dossier P251411.
 *
 * Draait dezelfde parsers, regels en bronverificatie als de applicatie; alleen de
 * bron verschilt (bestandssysteem in plaats van Supabase Storage). Dat is precies
 * wat de bronnenlaag moet aantonen: de analyse is onafhankelijk van waar de
 * bestanden vandaan komen.
 *
 * Volledig lokaal. Geen Supabase, geen AI-dienst, geen netwerk.
 * Slaat zichzelf over wanneer de map ontbreekt, zodat dit nooit een blokkade is.
 */
const PILOT_DIR = resolve(process.cwd(), "Pilot data", "P251411");
const available = existsSync(PILOT_DIR);

/** In de applicatie kiest de werkvoorbereider de rol; hier leiden we hem af. */
function guessRole(name: string): DocumentRole {
  const lower = name.toLowerCase();
  if (/(offerte|opdrachtbevestiging)/.test(lower)) return "offer";
  if (/(stukslijst|stuklijst)/.test(lower)) return "bill_of_materials";
  if (/vk\d/.test(lower)) return "drawing";
  return "unknown";
}

let documents: AnalysisDocument[] = [];
const unsupported: string[] = [];

describe.runIf(available)("dossier P251411", () => {
  beforeAll(async () => {
    const entries = (await readdir(PILOT_DIR)).sort();

    for (const entry of entries) {
      const fileType = extname(entry).toLowerCase().slice(1);

      if (!isAnalyzableFileType(fileType)) {
        unsupported.push(entry);
        continue;
      }

      const role = guessRole(entry);
      if (role === "unknown") continue;

      const parser = findParser(fileType);
      if (!parser) continue;

      const bytes = new Uint8Array(await readFile(join(PILOT_DIR, entry)));
      const parsed = await parser.parse(bytes, { fileName: entry, role, maxChars: 200_000 });
      if (!parsed.ok) throw new Error(`${entry}: ${parsed.message}`);

      documents.push({
        id: entry,
        fileName: entry,
        role,
        pages: parsed.document.pages,
        articles: parsed.document.articles,
        subprojectCount: parsed.document.subprojects?.length,
      });
    }

    documents = orderByRole(documents);
  });

  it("herkent de drie bronsoorten", () => {
    const roles = documents.map((d) => d.role);

    expect(roles).toContain("offer");
    expect(roles).toContain("drawing");
    expect(roles).toContain("bill_of_materials");
  });

  it("leest de stuklijst als gestructureerde artikelen, niet als platte tekst", () => {
    const bom = documents.find((d) => d.role === "bill_of_materials")!;

    expect(bom.articles).toBeDefined();
    expect(bom.articles!.length).toBeGreaterThan(50);
    expect(bom.subprojectCount).toBeGreaterThan(1);

    // 32.000 rijen worden een paar honderd artikelen; de tekstweergave blijft klein.
    expect(bom.pages.join("").length).toBeLessThan(100_000);
  });

  it("vindt de bekende artikelen met een aantal per subproject", () => {
    const bom = documents.find((d) => d.role === "bill_of_materials")!;
    const perUnit = (needle: string) => {
      const article = bom.articles!.find((a) =>
        a.description.toLowerCase().includes(needle.toLowerCase()),
      );
      return article ? article.totalAmount / (bom.subprojectCount ?? 1) : null;
    };

    // Waargenomen in het echte dossier: 10 WCD en 1 armatuur per wagen.
    expect(perUnit("WCD 1-voudig")).toBe(10);
    expect(perUnit("Plafond-/wandarmatuur")).toBe(1);
  });

  it("slaat Inventor- en Revit-bestanden over zonder ze te analyseren", () => {
    // In dit dossier zitten geen CAD-bestanden; de lijst mag leeg zijn, maar als
    // er iets in zit hoort het niet in de analyse te staan.
    for (const name of unsupported) {
      expect(documents.some((d) => d.fileName === name)).toBe(false);
    }
  });

  it("levert uitsluitend constateringen met een controleerbare bron", () => {
    const { accepted, rejected } = verifyFindings(analyseDocuments(documents), documents);

    expect(rejected).toHaveLength(0);

    for (const finding of accepted) {
      const bron = documents.find((d) => d.id === finding.source_document_id)!;
      expect(bron.pages.join("\n")).toContain(finding.source_quote);

      if (finding.compared_quote) {
        const tweede = documents.find((d) => d.id === finding.compared_document_id)!;
        expect(tweede.pages.join("\n")).toContain(finding.compared_quote);
      }
    }
  });

  it("verzint geen afwijking waar de grootheden niet vergelijkbaar zijn", () => {
    const { accepted } = verifyFindings(analyseDocuments(documents), documents);

    // Elke harde afwijking moet twee citaten hebben; zonder tweede bron is er
    // niets aangetoond en hoort het hooguit een aandachtspunt te zijn.
    for (const finding of accepted.filter((f) => f.finding_type === "discrepancy")) {
      expect(finding.compared_quote).toBeTruthy();
    }
  });

  it("rapporteert wat het dossier oplevert", () => {
    const { accepted } = verifyFindings(analyseDocuments(documents), documents);

    const perType: Record<string, number> = {};
    const perArea: Record<string, number> = {};
    for (const f of accepted) {
      perType[f.finding_type] = (perType[f.finding_type] ?? 0) + 1;
      perArea[f.check_area] = (perArea[f.check_area] ?? 0) + 1;
    }

    console.log("\n  Documenten:", documents.map((d) => `${d.role}=${d.fileName}`).join("\n              "));
    console.log("  Niet geanalyseerd:", unsupported.length ? unsupported.join(", ") : "geen");
    console.log("  Constateringen per soort:", JSON.stringify(perType));
    console.log("  Constateringen per controle:", JSON.stringify(perArea));
    for (const f of accepted) {
      console.log(`   [${f.finding_type}/${f.check_area}] ${f.title}`);
    }

    expect(accepted.length).toBeGreaterThanOrEqual(0);
  });
});
