/**
 * Pilotanalyse: wat kunnen we technisch betrouwbaar uit een echt dossier lezen?
 *
 * Draait VOLLEDIG LOKAAL. Geen Supabase, geen OpenAI, geen enkele netwerkaanroep.
 * De documenten worden alleen gelezen, nooit gewijzigd, verplaatst of verstuurd.
 *
 * Dit script raakt de applicatielogica niet aan; het gebruikt alleen dezelfde
 * PDF-extractie (unpdf) en dezelfde onderdeeldefinities als de applicatie, zodat
 * de uitkomst representatief is voor wat de controle straks zou zien.
 *
 * Gebruik:
 *   node scripts/pilot-analyse.mjs <map> [--rapport <pad.md>] [--citaten]
 *
 * Zonder --citaten worden geen documentregels in het rapport opgenomen, alleen
 * tellingen en structuurkenmerken. Dat houdt het rapport deelbaar.
 */

import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { extractText, getDocumentProxy, getMeta } from "unpdf";

import { TRACKED_ITEMS } from "../src/features/ai/rules/brouwer-rules.ts";

// --- Instellingen ----------------------------------------------------------

/** Onder dit aantal tekens per pagina gaan we ervan uit dat er geen tekstlaag is. */
const MIN_CHARS_PER_PAGE = 40;

/** Pagina's met minder dan dit aantal tekens tellen als "vrijwel leeg". */
const SPARSE_PAGE_CHARS = 200;

const ANALYZABLE = new Set([".pdf"]);

const CAD_EXTENSIONS = new Set([".ipt", ".iam", ".idw", ".rvt", ".rfa", ".dwg", ".dxf", ".step", ".stp"]);

const OFFICE_EXTENSIONS = new Set([".xlsx", ".xls", ".xlsm", ".docx", ".doc", ".csv"]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif"]);

// --- Hulpfuncties ----------------------------------------------------------

function classifyExtension(ext) {
  if (ANALYZABLE.has(ext)) return "pdf";
  if (CAD_EXTENSIONS.has(ext)) return "cad";
  if (OFFICE_EXTENSIONS.has(ext)) return "office";
  if (IMAGE_EXTENSIONS.has(ext)) return "afbeelding";
  return "overig";
}

/** Ruwe gok op de documentrol op basis van de bestandsnaam. Puur informatief. */
function guessRole(fileName) {
  const name = fileName.toLowerCase();
  if (/(offerte|aanbieding|quotation|offer)/.test(name)) return "offer";
  if (/(stuklijst|onderdelenlijst|bom|bill.?of.?materials|materiaallijst|partlist)/.test(name)) {
    return "bill_of_materials";
  }
  if (/(tekening|plattegrond|drawing|aanzicht|doorsnede|blad|detail|plan)/.test(name)) return "drawing";
  if (/(bestek|specificatie|omschrijving|spec)/.test(name)) return "specification";
  return "unknown";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(full)));
    } else if (entry.isFile() && !entry.name.startsWith(".")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Telt hoe vaak elk gevolgd onderdeel voorkomt, en of er een aantal bij te
 * bepalen is. Bewust dezelfde synoniemenlijst als de applicatie, inclusief de
 * brede varianten, zodat vals-positieven zichtbaar worden in plaats van verborgen.
 */
function scanItems(pages) {
  const hits = new Map();

  pages.forEach((page, pageIndex) => {
    for (const rawLine of page.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      for (const item of TRACKED_ITEMS) {
        const synonym = item.synonyms.find((word) => lower.includes(word));
        if (!synonym) continue;

        const entry = hits.get(item.key) ?? {
          key: item.key,
          label: item.label,
          matches: 0,
          withCount: 0,
          pages: new Set(),
          samples: [],
          matchedSynonyms: new Set(),
        };

        entry.matches += 1;
        entry.pages.add(pageIndex + 1);
        entry.matchedSynonyms.add(synonym);
        if (/\d/.test(line)) entry.withCount += 1;
        if (entry.samples.length < 4) entry.samples.push({ page: pageIndex + 1, line });

        hits.set(item.key, entry);
      }
    }
  });

  return [...hits.values()].sort((a, b) => b.matches - a.matches);
}

/** Structuurkenmerken die iets zeggen over hoe machineleesbaar een pagina is. */
function describeStructure(pages) {
  const allText = pages.join("\n");
  const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);

  const numericLines = lines.filter((l) => /\d/.test(l)).length;
  const measurementLines = lines.filter((l) => /\d+\s*(mm|cm|m)\b/i.test(l)).length;
  const shortLines = lines.filter((l) => l.length <= 12).length;
  const tableish = lines.filter((l) => /\s{3,}|\t/.test(l)).length;
  const codeish = lines.filter((l) => /\b[A-Z]{2,}[-_ ]?\d{3,}\b/.test(l)).length;

  return {
    totalLines: lines.length,
    avgLineLength: lines.length ? Math.round(allText.length / lines.length) : 0,
    numericLines,
    measurementLines,
    shortLines,
    tableish,
    codeish,
  };
}

// --- PDF lezen -------------------------------------------------------------

async function analysePdf(path) {
  const buffer = new Uint8Array(await readFile(path));

  let meta = null;
  let pages = [];
  let totalPages = 0;
  let error = null;

  try {
    const proxy = await getDocumentProxy(buffer);
    totalPages = proxy.numPages;
    try {
      const m = await getMeta(proxy);
      meta = {
        producer: m?.info?.Producer ?? null,
        creator: m?.info?.Creator ?? null,
        encrypted: Boolean(m?.info?.IsEncrypted),
      };
    } catch {
      meta = null;
    }
    const extracted = await extractText(proxy, { mergePages: false });
    pages = extracted.text;
    totalPages = extracted.totalPages ?? totalPages;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const pageStats = pages.map((text, index) => ({
    page: index + 1,
    chars: text.trim().length,
    hasText: text.trim().length >= MIN_CHARS_PER_PAGE,
  }));

  const pagesWithText = pageStats.filter((p) => p.hasText).length;
  const sparsePages = pageStats.filter((p) => p.hasText && p.chars < SPARSE_PAGE_CHARS).length;
  const totalChars = pageStats.reduce((sum, p) => sum + p.chars, 0);

  return {
    error,
    meta,
    totalPages,
    pagesWithText,
    pagesWithoutText: totalPages - pagesWithText,
    sparsePages,
    totalChars,
    pageStats,
    pages,
    structure: pages.length ? describeStructure(pages) : null,
    items: pages.length ? scanItems(pages) : [],
  };
}

// --- Rapport ---------------------------------------------------------------

function verdictFor(doc) {
  if (doc.kind !== "pdf") {
    return doc.kind === "cad"
      ? ["Niet leesbaar", "CAD-bestand; wordt bewaard maar niet geanalyseerd."]
      : doc.kind === "office"
        ? ["Niet leesbaar", "Office-bestand; nog geen parser in de applicatie."]
        : doc.kind === "afbeelding"
          ? ["Niet leesbaar", "Afbeelding; vereist OCR."]
          : ["Niet leesbaar", "Onbekend bestandstype."];
  }
  if (doc.analysis.error) return ["Fout", `PDF kon niet gelezen worden: ${doc.analysis.error}`];
  if (doc.analysis.pagesWithText === 0) {
    return ["Geen tekstlaag", "Vermoedelijk een scan of een gerasterde tekening; vereist OCR."];
  }
  if (doc.analysis.pagesWithoutText > 0) {
    return [
      "Gedeeltelijk",
      `${doc.analysis.pagesWithText} van ${doc.analysis.totalPages} pagina's bevat tekst; de rest is vermoedelijk beeld.`,
    ];
  }
  if (doc.analysis.totalChars < 200) {
    return ["Zeer weinig tekst", "Wel een tekstlaag, maar te weinig inhoud om op te vergelijken."];
  }
  return ["Leesbaar", "Volledige tekstlaag aanwezig."];
}

function buildReport(dir, docs, withQuotes) {
  const lines = [];
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");

  lines.push(`# Pilotanalyse ${basename(dir)}`);
  lines.push("");
  lines.push(`Gegenereerd: ${now} · lokaal uitgevoerd, geen netwerkaanroepen.`);
  lines.push("");
  lines.push(
    withQuotes
      ? "> Bevat letterlijke documentregels. Behandel dit rapport als vertrouwelijk."
      : "> Bevat geen documentinhoud, alleen tellingen en structuurkenmerken.",
  );
  lines.push("");

  // Samenvatting
  const pdfs = docs.filter((d) => d.kind === "pdf");
  const leesbaar = pdfs.filter((d) => !d.analysis.error && d.analysis.pagesWithText > 0);
  const zonderTekst = pdfs.filter((d) => !d.analysis.error && d.analysis.pagesWithText === 0);
  const nietPdf = docs.filter((d) => d.kind !== "pdf");

  lines.push("## Samenvatting");
  lines.push("");
  lines.push("| | Aantal |");
  lines.push("| --- | ---: |");
  lines.push(`| Bestanden totaal | ${docs.length} |`);
  lines.push(`| PDF | ${pdfs.length} |`);
  lines.push(`| PDF met tekstlaag | ${leesbaar.length} |`);
  lines.push(`| PDF zonder tekstlaag (OCR nodig) | ${zonderTekst.length} |`);
  lines.push(`| Niet-PDF (CAD, Office, beeld) | ${nietPdf.length} |`);
  lines.push(
    `| Pagina's totaal | ${pdfs.reduce((s, d) => s + (d.analysis.totalPages || 0), 0)} |`,
  );
  lines.push(
    `| Pagina's met tekst | ${pdfs.reduce((s, d) => s + (d.analysis.pagesWithText || 0), 0)} |`,
  );
  lines.push("");

  // Per document
  lines.push("## Per document");
  lines.push("");
  lines.push("| Bestand | Type | Rol (gok) | Grootte | Pagina's | Met tekst | Tekens | Oordeel |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | --- |");
  for (const doc of docs) {
    const [verdict] = verdictFor(doc);
    const a = doc.analysis;
    lines.push(
      `| ${doc.name} | ${doc.ext.replace(".", "") || "?"} | ${doc.roleGuess} | ${formatBytes(doc.size)} | ` +
        `${a?.totalPages ?? "-"} | ${a?.pagesWithText ?? "-"} | ${a?.totalChars ?? "-"} | ${verdict} |`,
    );
  }
  lines.push("");

  // Detail per leesbaar document
  for (const doc of pdfs) {
    const a = doc.analysis;
    const [verdict, toelichting] = verdictFor(doc);

    lines.push(`### ${doc.name}`);
    lines.push("");
    lines.push(`**Oordeel: ${verdict}.** ${toelichting}`);
    lines.push("");

    if (a.error) {
      lines.push("```");
      lines.push(a.error);
      lines.push("```");
      lines.push("");
      continue;
    }

    if (a.meta) {
      lines.push(
        `Aangemaakt met: ${a.meta.creator ?? "onbekend"} · Producer: ${a.meta.producer ?? "onbekend"}`,
      );
      lines.push("");
    }

    if (a.totalPages > 1) {
      lines.push("Tekens per pagina:");
      lines.push("");
      lines.push("| Pagina | Tekens | Tekstlaag |");
      lines.push("| ---: | ---: | --- |");
      for (const p of a.pageStats) {
        lines.push(`| ${p.page} | ${p.chars} | ${p.hasText ? "ja" : "nee"} |`);
      }
      lines.push("");
    }

    if (a.structure) {
      const s = a.structure;
      lines.push("Structuurkenmerken:");
      lines.push("");
      lines.push(`- Regels: ${s.totalLines}, gemiddeld ${s.avgLineLength} tekens`);
      lines.push(`- Regels met een getal: ${s.numericLines}`);
      lines.push(`- Regels met een maat (mm/cm/m): ${s.measurementLines}`);
      lines.push(`- Zeer korte regels (<= 12 tekens): ${s.shortLines}`);
      lines.push(`- Regels met kolomwitruimte (tabelachtig): ${s.tableish}`);
      lines.push(`- Regels met een artikelcode-achtig patroon: ${s.codeish}`);
      lines.push("");
    }

    if (a.items.length) {
      lines.push("Herkende onderdelen met de huidige TRACKED_ITEMS:");
      lines.push("");
      lines.push("| Onderdeel | Treffers | Met getal | Pagina's | Gematchte schrijfwijzen |");
      lines.push("| --- | ---: | ---: | --- | --- |");
      for (const item of a.items) {
        lines.push(
          `| ${item.label} | ${item.matches} | ${item.withCount} | ${[...item.pages].join(", ")} | ${[...item.matchedSynonyms].join(", ")} |`,
        );
      }
      lines.push("");

      if (withQuotes) {
        lines.push("Voorbeeldregels (voor beoordeling op vals-positieven):");
        lines.push("");
        for (const item of a.items) {
          lines.push(`- **${item.label}**`);
          for (const s of item.samples) {
            lines.push(`  - p${s.page}: \`${s.line.replace(/`/g, "'")}\``);
          }
        }
        lines.push("");
      }
    } else if (a.pagesWithText > 0) {
      lines.push("Geen van de gevolgde onderdelen herkend in dit document.");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// --- Uitvoeren -------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith("--"));
  const withQuotes = args.includes("--citaten");
  const reportIndex = args.indexOf("--rapport");
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;

  if (!dirArg) {
    console.error("Gebruik: node scripts/pilot-analyse.mjs <map> [--rapport <pad.md>] [--citaten]");
    process.exit(2);
  }

  const dir = resolve(dirArg);
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) throw new Error("geen map");
  } catch {
    console.error(`Map niet gevonden: ${dir}`);
    process.exit(2);
  }

  const files = await walk(dir);
  if (files.length === 0) {
    console.error(`Geen bestanden gevonden in ${dir}`);
    process.exit(1);
  }

  const docs = [];
  for (const path of files) {
    const info = await stat(path);
    const ext = extname(path).toLowerCase();
    const kind = classifyExtension(ext);

    const doc = {
      name: basename(path),
      path,
      ext,
      kind,
      size: info.size,
      roleGuess: guessRole(basename(path)),
      analysis: null,
    };

    if (kind === "pdf") {
      process.stderr.write(`lezen: ${doc.name} … `);
      doc.analysis = await analysePdf(path);
      process.stderr.write(
        doc.analysis.error
          ? "FOUT\n"
          : `${doc.analysis.pagesWithText}/${doc.analysis.totalPages} pagina's met tekst\n`,
      );
    }

    docs.push(doc);
  }

  const report = buildReport(dir, docs, withQuotes);

  if (reportPath) {
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(resolve(reportPath), report, "utf8");
    console.error(`\nRapport geschreven naar ${resolve(reportPath)}`);
  } else {
    console.log(report);
  }
}

await main();
