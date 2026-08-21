import { describe, expect, it } from "vitest";

import { analyseDocuments } from "@/features/ai/providers/mock-analysis";
import { ARTICLE_LINKS, findArticleLink } from "./brouwer-rules";
import type { BomArticle } from "@/features/documents/parsers";
import type { AnalysisDocument } from "@/features/ai/verify-findings";

/** Stuklijst zoals de xlsx-parser hem oplevert. */
function bom(
  articles: { number: string; description: string; perUnit: number }[],
  subprojectCount = 100,
): AnalysisDocument {
  const parsed: BomArticle[] = articles.map((a) => ({
    articleNumber: a.number,
    description: a.description,
    unit: "Stuks",
    totalAmount: a.perUnit * subprojectCount,
    perSubproject: new Map(),
    rowCount: subprojectCount,
  }));

  return {
    id: "bom",
    fileName: "stuklijst.xlsx",
    role: "bill_of_materials",
    pages: [
      ["Stuklijst stuklijst.xlsx", ""]
        .concat(
          parsed.map(
            (a) =>
              `${a.articleNumber} | ${a.description} | ${a.totalAmount} Stuks (${a.totalAmount / subprojectCount} per subproject)`,
          ),
        )
        .join("\n"),
    ],
    articles: parsed,
    subprojectCount,
  };
}

/** De artikelen uit het echte dossier P251411 die bij deze koppelingen horen. */
const echteStuklijst = bom([
  { number: "900006878", description: "LED STRIP 5M 24V 4000K IP20 LEDS 50055062 (YPHIX)", perUnit: 1 },
  { number: "900006188", description: "LED STRIP PROFIEL POTENZA ALUMINIUM LAAG 5M", perUnit: 1 },
  { number: "900002235", description: "LED TRANSFORMATOR 24V 2,08A MAX 50W DIMBAAR", perUnit: 1 },
  { number: "12620093", description: "Afdekraam 2-voudig, RAL 9010 polar wit", perUnit: 5 },
  {
    number: "11630145-S",
    description: "Kunststof schuifraam BZ, wanddikte 43mm, dubbel glas met rolluik + ventilatie",
    perUnit: 2,
  },
]);

describe("ARTICLE_LINKS", () => {
  // Welke koppelingen er precies zijn, staat in bevestigde-koppelingen.test.ts.
  it("legt per koppeling vast of het om een totaal of om meerwerk gaat", () => {
    for (const link of ARTICLE_LINKS) {
      expect(["total", "extra"]).toContain(link.countsAs);
      expect(link.articleNumbers.length).toBeGreaterThan(0);
    }
  });

  it("koppelt de LED-strip aan het strip-artikel, niet aan profiel of trafo", () => {
    expect(findArticleLink("led_strip")!.articleNumbers).toEqual(["900006878"]);
  });

  it("koppelt het raam aan het schuifraam, niet aan het elektra-afdekraam", () => {
    expect(findArticleLink("raam")!.articleNumbers).toEqual(["11630145-S"]);
  });

  it("koppelt niets waarvoor het bewijs ontbreekt", () => {
    // Brouwer heeft koppeling voor deur en legplank uitdrukkelijk uitgesloten;
    // voor plafondarmatuur en lichtschakelaar is nog geen beslissing genomen.
    for (const item of ["deur", "legplank", "plafondarmatuur", "lichtschakelaar"]) {
      expect(findArticleLink(item)).toBeUndefined();
    }
  });
});

describe("het gekoppelde artikel krijgt voorrang", () => {
  it("vergelijkt het raam met het schuifraam en niet met Afdekraam", () => {
    // Afdekraam heeft een hoger aantal (5 tegen 2) en zou zonder koppeling winnen.
    const offerte: AnalysisDocument = {
      id: "offer",
      fileName: "offerte.pdf",
      role: "offer",
      pages: ["Offerte\nRaam : 2x Kunststofschuifraam met veiligheidsglas en rolluik"],
    };

    const findings = analyseDocuments([offerte, echteStuklijst]);
    const raam = findings.find((f) => f.check_area === "offer_vs_bom" && f.title.includes("raam"));

    // Offerte zegt 2, gekoppeld artikel is 2 per unit: geen constatering.
    expect(raam).toBeUndefined();
  });

  it("signaleert een afwijkend aantal en citeert het juiste artikel", () => {
    const offerte: AnalysisDocument = {
      id: "offer",
      fileName: "offerte.pdf",
      role: "offer",
      pages: ["Offerte\nRaam : 3x Kunststofschuifraam met veiligheidsglas en rolluik"],
    };

    const findings = analyseDocuments([offerte, echteStuklijst]);
    const raam = findings.find((f) => f.check_area === "offer_vs_bom" && f.title.includes("ramen"));

    expect(raam).toBeDefined();
    // Het citaat komt uit de schuifraam-regel, niet uit Afdekraam. Daar is de
    // koppeling voor: zonder die voorrang won Afdekraam op aantal.
    expect(raam!.compared_quote).toContain("11630145-S");
    expect(raam!.compared_quote).not.toContain("Afdekraam");
    expect(raam!.description).toContain("3");
  });

  // Raam stond eerder in STANDARD_ITEMS, waardoor een verschil hooguit een
  // aandachtspunt kon worden. Brouwer heeft bevestigd dat raam geen
  // standaardonderdeel is; dat gedrag wordt nu in bevestigde-koppelingen.test.ts
  // vastgelegd.

  it("meldt het wanneer het gekoppelde artikel helemaal ontbreekt", () => {
    const zonderRaam = bom([
      { number: "900006878", description: "LED STRIP 5M 24V 4000K IP20", perUnit: 1 },
      { number: "12620093", description: "Afdekraam 2-voudig, RAL 9010 polar wit", perUnit: 5 },
    ]);
    const offerte: AnalysisDocument = {
      id: "offer",
      fileName: "offerte.pdf",
      role: "offer",
      pages: ["Offerte\nRaam : 2x Kunststofschuifraam met veiligheidsglas en rolluik"],
    };

    const findings = analyseDocuments([offerte, zonderRaam]);
    const raam = findings.find((f) => f.title.includes("gekoppeld artikel niet"));

    expect(raam).toBeDefined();
    expect(raam!.finding_type).toBe("missing");
    expect(raam!.description).toContain("11630145-S");
  });

  it("laat de LED-strip niet struikelen over profiel en trafo", () => {
    const tekening: AnalysisDocument = {
      id: "drawing",
      fileName: "vk01.pdf",
      role: "drawing",
      pages: ["Verkooptekening\nLED-strip 24V 4000 Kelvin incl trafo in schaftruimte"],
    };

    const findings = analyseDocuments([tekening, echteStuklijst]);
    const led = findings.filter((f) => f.title.includes("LED-strip"));

    // Geen aantal op de tekening (24V is geen aantal), dus niets aantoonbaar.
    expect(led.every((f) => f.finding_type !== "discrepancy")).toBe(true);
  });
});
