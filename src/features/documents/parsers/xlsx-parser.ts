import { unzipSync } from "fflate";

import type {
  BomArticle,
  DocumentParser,
  ParseContext,
  ParsedDocument,
  ParseResult,
} from "./types";

/**
 * Parser voor de stuklijst-export uit het interne Brouwer-systeem.
 *
 * De export is geen handgemaakte spreadsheet maar een systeemexport van ongeveer
 * 32.000 rijen, met meerdere subprojecten (P251411-01 t/m -100) in één bestand.
 *
 * Twee ontwerpkeuzes die er echt toe doen:
 *
 * 1. **Rijen worden direct samengevoegd tot artikelen.** We houden nooit alle
 *    32.000 rijen in het geheugen. 32.000 rijen leveren in de praktijk ongeveer
 *    180 unieke artikelen op; die aggregatie is wat de controle nodig heeft.
 *
 * 2. **De tekstweergave is afgeleid van de aggregatie, niet van de ruwe rijen.**
 *    Zo blijft de bronverificatie werken (een citaat moet letterlijk terugvindbaar
 *    zijn) zonder dat we de hele Excel als platte tekst opslaan.
 */

/** Kolomnamen die we herkennen, met de varianten die in exports voorkomen. */
const COLUMN_ALIASES: Record<string, string[]> = {
  articleNumber: ["article_number", "artikelnummer", "artikel_nummer", "articlenumber", "artikelnr"],
  description: [
    "article_description",
    "artikelomschrijving",
    "omschrijving",
    "description",
    "artikel_omschrijving",
  ],
  amount: ["amount", "aantal", "qty", "quantity", "hoeveelheid"],
  unit: ["article_unit", "eenheid", "unit"],
  subproject: ["project", "subproject", "sub_project", "projectregel"],
  projectNumber: ["project_number", "projectnummer", "hoofdproject"],
};

type ColumnMap = Partial<Record<keyof typeof COLUMN_ALIASES, string>>;

function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

/** sharedStrings.xml bevat alle tekstwaarden; cellen verwijzen ernaar met een index. */
export function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siPattern = /<si>([\s\S]*?)<\/si>/g;
  let si: RegExpExecArray | null;

  while ((si = siPattern.exec(xml)) !== null) {
    // Een cel kan uit meerdere opgemaakte fragmenten bestaan; die horen aaneen.
    const parts: string[] = [];
    const tPattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tPattern.exec(si[1])) !== null) parts.push(decodeEntities(t[1]));
    strings.push(parts.join(""));
  }

  return strings;
}

function columnLetter(ref: string): string {
  let letters = "";
  for (const char of ref) {
    if (char >= "A" && char <= "Z") letters += char;
    else break;
  }
  return letters;
}

/** Leest de cellen van één `<row>`-fragment uit. */
function parseRow(rowXml: string, shared: string[]): Map<string, string> {
  const cells = new Map<string, string>();
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let cell: RegExpExecArray | null;

  while ((cell = cellPattern.exec(rowXml)) !== null) {
    const attrs = cell[1] ?? "";
    const body = cell[2] ?? "";

    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!ref) continue;

    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
    let value = "";

    if (type === "s") {
      const index = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "-1");
      value = shared[index] ?? "";
    } else if (type === "inlineStr") {
      const parts: string[] = [];
      const tPattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let t: RegExpExecArray | null;
      while ((t = tPattern.exec(body)) !== null) parts.push(decodeEntities(t[1]));
      value = parts.join("");
    } else {
      value = decodeEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
    }

    if (value !== "") cells.set(columnLetter(ref), value.trim());
  }

  return cells;
}

/** Koppelt kolomletters aan betekenis op basis van de kopregel. */
export function mapColumns(header: Map<string, string>): ColumnMap {
  const map: ColumnMap = {};

  for (const [letter, rawName] of header) {
    const name = rawName.toLowerCase().replace(/\s+/g, "_");
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[key as keyof ColumnMap]) continue;
      if (aliases.includes(name)) {
        map[key as keyof ColumnMap] = letter;
        break;
      }
    }
  }

  return map;
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  // Exports gebruiken zowel "3" als "3.0" als "3,0".
  const normalised = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalised);
  return Number.isFinite(value) ? value : 0;
}

/** Canonieke regel per artikel. Dit is wat een citaat moet kunnen aanwijzen. */
export function renderArticleLine(article: BomArticle, subprojectCount: number): string {
  const perUnit =
    subprojectCount > 1
      ? ` (${(article.totalAmount / subprojectCount).toFixed(2).replace(/\.00$/, "")} per subproject)`
      : "";
  return `${article.articleNumber} | ${article.description} | ${article.totalAmount} ${article.unit}${perUnit}`.trim();
}

export type XlsxParseOptions = {
  /** Maximum aantal unieke artikelen dat we bijhouden. Vangnet tegen extreme bestanden. */
  maxArticles?: number;
};

/**
 * Verwerkt de sheet-XML rij voor rij en voegt direct samen tot artikelen.
 * Houdt nooit alle rijen tegelijk vast.
 */
export function aggregateSheet(
  sheetXml: string,
  shared: string[],
  options: XlsxParseOptions = {},
): {
  columns: ColumnMap;
  articles: BomArticle[];
  subprojects: string[];
  rowCount: number;
  skipped: number;
  truncated: boolean;
} {
  const maxArticles = options.maxArticles ?? 5000;

  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const articles = new Map<string, BomArticle>();
  const subprojects = new Set<string>();

  let columns: ColumnMap = {};
  let headerSeen = false;
  let rowCount = 0;
  let skipped = 0;
  let truncated = false;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(sheetXml)) !== null) {
    const cells = parseRow(match[1], shared);
    if (cells.size === 0) continue;

    if (!headerSeen) {
      const candidate = mapColumns(cells);
      // Pas als we omschrijving én aantal herkennen is dit een echte kopregel.
      if (candidate.description && candidate.amount) {
        columns = candidate;
        headerSeen = true;
      }
      continue;
    }

    rowCount += 1;

    const description = columns.description ? cells.get(columns.description) : undefined;
    const articleNumber = columns.articleNumber ? cells.get(columns.articleNumber) : undefined;

    // Regels zonder artikel én zonder omschrijving zijn routering of lege regels.
    if (!description && !articleNumber) {
      skipped += 1;
      continue;
    }

    const amount = parseAmount(columns.amount ? cells.get(columns.amount) : undefined);
    const subproject = columns.subproject ? cells.get(columns.subproject) : undefined;
    if (subproject) subprojects.add(subproject);

    // Zonder omschrijving valt er niets te vergelijken; wel meetellen als verwerkt.
    if (!description) {
      skipped += 1;
      continue;
    }

    const key = `${articleNumber ?? ""}|${description}`;
    let article = articles.get(key);

    if (!article) {
      if (articles.size >= maxArticles) {
        truncated = true;
        skipped += 1;
        continue;
      }
      article = {
        articleNumber: articleNumber ?? "-",
        description,
        unit: (columns.unit ? cells.get(columns.unit) : undefined) ?? "",
        totalAmount: 0,
        perSubproject: new Map(),
        rowCount: 0,
      };
      articles.set(key, article);
    }

    article.totalAmount += amount;
    article.rowCount += 1;
    if (subproject) {
      article.perSubproject.set(subproject, (article.perSubproject.get(subproject) ?? 0) + amount);
    }
  }

  return {
    columns,
    articles: [...articles.values()].sort((a, b) => b.totalAmount - a.totalAmount),
    subprojects: [...subprojects].sort(),
    rowCount,
    skipped,
    truncated,
  };
}

/** Haalt alleen de benodigde onderdelen uit het zip-archief. */
function readXlsxParts(data: Uint8Array): { sheet: string | null; shared: string } {
  const decoder = new TextDecoder("utf-8");

  const files = unzipSync(data, {
    filter: (file) =>
      file.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name),
  });

  const sharedBytes = files["xl/sharedStrings.xml"];
  const shared = sharedBytes ? decoder.decode(sharedBytes) : "";

  // Het eerste werkblad op nummer; exports zetten de data doorgaans in sheet1.
  const sheetNames = Object.keys(files)
    .filter((name) => name.startsWith("xl/worksheets/"))
    .sort();

  const sheet = sheetNames.length ? decoder.decode(files[sheetNames[0]]) : null;
  return { sheet, shared };
}

export class XlsxParser implements DocumentParser {
  readonly id = "xlsx";
  readonly fileTypes = ["xlsx", "xlsm"] as const;

  async parse(data: Uint8Array, context: ParseContext): Promise<ParseResult> {
    let sheet: string | null;
    let sharedXml: string;

    try {
      ({ sheet, shared: sharedXml } = readXlsxParts(data));
    } catch (error) {
      return {
        ok: false,
        message: `Het Excel-bestand kon niet worden uitgepakt: ${
          error instanceof Error ? error.message : "onbekende fout"
        }`,
      };
    }

    if (!sheet) return { ok: false, message: "Geen werkblad gevonden in het Excel-bestand." };

    const shared = parseSharedStrings(sharedXml);
    const result = aggregateSheet(sheet, shared);

    if (!result.columns.description || !result.columns.amount) {
      return {
        ok: false,
        message:
          "In dit Excel-bestand zijn geen herkenbare kolommen voor omschrijving en aantal gevonden. " +
          "Verwacht een export met kolomnamen zoals article_description en amount.",
      };
    }

    if (result.articles.length === 0) {
      return { ok: false, message: "Het Excel-bestand bevat geen bruikbare artikelregels." };
    }

    const subprojectCount = result.subprojects.length;
    const header = [
      `Stuklijst ${context.fileName}`,
      `Artikelen: ${result.articles.length} · verwerkte regels: ${result.rowCount}` +
        (subprojectCount ? ` · subprojecten: ${subprojectCount}` : ""),
      "",
    ];

    const lines: string[] = [];
    let used = header.join("\n").length;
    let truncated = result.truncated;

    for (const article of result.articles) {
      const line = renderArticleLine(article, subprojectCount);
      if (used + line.length + 1 > context.maxChars) {
        truncated = true;
        break;
      }
      lines.push(line);
      used += line.length + 1;
    }

    const document: ParsedDocument = {
      kind: "spreadsheet",
      pages: [header.concat(lines).join("\n")],
      articles: result.articles,
      subprojects: result.subprojects,
      meta: {
        pageCount: 1,
        rowCount: result.rowCount,
        truncated,
        note: subprojectCount
          ? `Aantallen zijn totalen over ${subprojectCount} subproject(en).`
          : undefined,
      },
    };

    return { ok: true, document };
  }
}
