import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { findParser } from "./index";
import { XlsxParser, aggregateSheet, mapColumns, parseSharedStrings } from "./xlsx-parser";

/** Bouwt een geldige xlsx met een gedeelde-teksttabel, zoals een echte export. */
function buildXlsx(header: string[], rows: (string | number)[][]): Uint8Array {
  const strings: string[] = [];
  const indexOf = (value: string) => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };

  const letters = (index: number) => String.fromCharCode(65 + index);

  const rowXml = (cells: (string | number)[], rowNumber: number) =>
    `<row r="${rowNumber}">` +
    cells
      .map((cell, index) => {
        const ref = `${letters(index)}${rowNumber}`;
        if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
        if (cell === "") return "";
        return `<c r="${ref}" t="s"><v>${indexOf(cell)}</v></c>`;
      })
      .join("") +
    "</row>";

  const body = [header, ...rows]
    .map((cells, index) => rowXml(cells, index + 1))
    .join("");

  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
  const shared =
    `<?xml version="1.0"?><sst count="${strings.length}">` +
    strings
      .map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`)
      .join("") +
    "</sst>";

  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8("<workbook/>"),
    "xl/sharedStrings.xml": strToU8(shared),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

const HEADER = [
  "week",
  "project_number",
  "project",
  "article_number",
  "article_description",
  "amount",
  "article_unit",
];

function row(subproject: string, article: string, description: string, amount: number) {
  return ["202627", "P251411", subproject, article, description, amount, "Stuks"];
}

const context = { fileName: "stuklijst.xlsx", role: "bill_of_materials" as const, maxChars: 200_000 };

describe("sharedStrings", () => {
  it("plakt opgemaakte tekstfragmenten aaneen", () => {
    const xml = "<sst><si><t>Legplank </t><t>400x1040mm</t></si><si><t>WCD</t></si></sst>";

    expect(parseSharedStrings(xml)).toEqual(["Legplank 400x1040mm", "WCD"]);
  });

  it("decodeert entiteiten", () => {
    expect(parseSharedStrings("<sst><si><t>5/8&quot; &amp; 16mm</t></si></sst>")).toEqual([
      '5/8" & 16mm',
    ]);
  });
});

describe("kolomherkenning", () => {
  it("herkent de kolomnamen van de echte export", () => {
    const header = new Map(HEADER.map((name, index) => [String.fromCharCode(65 + index), name]));
    const columns = mapColumns(header);

    expect(columns.articleNumber).toBe("D");
    expect(columns.description).toBe("E");
    expect(columns.amount).toBe("F");
    expect(columns.subproject).toBe("C");
  });

  it("herkent ook Nederlandse kolomnamen", () => {
    const header = new Map([
      ["A", "Artikelnummer"],
      ["B", "Omschrijving"],
      ["C", "Aantal"],
    ]);
    const columns = mapColumns(header);

    expect(columns.articleNumber).toBe("A");
    expect(columns.description).toBe("B");
    expect(columns.amount).toBe("C");
  });
});

describe("XlsxParser", () => {
  it("leest artikel, omschrijving, aantal en subproject", async () => {
    const file = buildXlsx(HEADER, [
      row("P251411-01", "12620094", "WCD 1-voudig + randaarde inbouw", 10),
      row("P251411-02", "12620094", "WCD 1-voudig + randaarde inbouw", 10),
      row("P251411-01", "900006561", "Plafond-/wandarmatuur met PIR sensor", 1),
    ]);

    const result = await new XlsxParser().parse(file, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wcd = result.document.articles!.find((a) => a.articleNumber === "12620094")!;
    expect(wcd.description).toBe("WCD 1-voudig + randaarde inbouw");
    expect(wcd.totalAmount).toBe(20);
    expect(wcd.perSubproject.get("P251411-01")).toBe(10);
    expect(result.document.subprojects).toEqual(["P251411-01", "P251411-02"]);
  });

  it("voegt rijen samen tot artikelen in plaats van ze los te bewaren", async () => {
    const rows = Array.from({ length: 500 }, (_, i) =>
      row(`P251411-${(i % 100) + 1}`, "12620094", "WCD 1-voudig", 2),
    );
    const result = await new XlsxParser().parse(buildXlsx(HEADER, rows), context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.articles).toHaveLength(1);
    expect(result.document.articles![0].totalAmount).toBe(1000);
    expect(result.document.articles![0].rowCount).toBe(500);
    expect(result.document.meta.rowCount).toBe(500);
  });

  it("negeert regels zonder artikel en zonder omschrijving", async () => {
    const result = await new XlsxParser().parse(
      buildXlsx(HEADER, [
        row("P251411-01", "1001", "Tafel 2400mm", 2),
        ["202627", "P251411", "P251411-01", "", "", "", ""],
      ]),
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.articles).toHaveLength(1);
  });

  it("levert een canonieke tekstweergave waarin een citaat terugvindbaar is", async () => {
    const result = await new XlsxParser().parse(
      buildXlsx(HEADER, [row("P251411-01", "12620094", "WCD 1-voudig + randaarde", 10)]),
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const text = result.document.pages.join("\n");
    expect(text).toContain("12620094");
    expect(text).toContain("WCD 1-voudig + randaarde");
    // Niet de volledige Excel als platte tekst: alleen de samengevoegde artikelen.
    expect(result.document.pages).toHaveLength(1);
  });

  it("weigert een bestand zonder herkenbare kolommen", async () => {
    const result = await new XlsxParser().parse(
      buildXlsx(["kolom1", "kolom2"], [["a", "b"]]),
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("kolommen");
  });

  it("geeft een leesbare fout bij iets dat geen xlsx is", async () => {
    const result = await new XlsxParser().parse(strToU8("dit is geen zip"), context);

    expect(result.ok).toBe(false);
  });
});

// --- Test J: grote bestanden -----------------------------------------------

describe("Test J: grote export blijft behapbaar", () => {
  it("verwerkt 32.000 rijen zonder ze allemaal vast te houden", async () => {
    // Zoals de echte export: 100 subprojecten, ongeveer 180 unieke artikelen.
    const rows: (string | number)[][] = [];
    for (let subproject = 1; subproject <= 100; subproject += 1) {
      for (let article = 1; article <= 320; article += 1) {
        rows.push(
          row(
            `P251411-${String(subproject).padStart(2, "0")}`,
            `ART-${String(article).padStart(4, "0")}`,
            `Artikel ${article} omschrijving`,
            2,
          ),
        );
      }
    }
    expect(rows).toHaveLength(32_000);

    const file = buildXlsx(HEADER, rows);
    const start = Date.now();
    const result = await new XlsxParser().parse(file, context);
    const duration = Date.now() - start;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 32.000 rijen worden 320 artikelen: de structuur schaalt met het aantal
    // artikelen, niet met het aantal regels.
    expect(result.document.meta.rowCount).toBe(32_000);
    expect(result.document.articles).toHaveLength(320);
    expect(result.document.subprojects).toHaveLength(100);
    expect(result.document.articles![0].totalAmount).toBe(200);

    // De tekstweergave blijft klein genoeg om mee te sturen.
    expect(result.document.pages.join("").length).toBeLessThan(60_000);
    expect(duration).toBeLessThan(20_000);
  }, 60_000);

  it("kapt af bij een absurd aantal unieke artikelen", () => {
    const many = Array.from(
      { length: 50 },
      (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" t="inlineStr"><is><t>Artikel ${i}</t></is></c><c r="B${i + 2}"><v>1</v></c></row>`,
    ).join("");
    const sheet = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>article_description</t></is></c><c r="B1" t="inlineStr"><is><t>amount</t></is></c></row>${many}</sheetData>`;

    const result = aggregateSheet(sheet, [], { maxArticles: 10 });

    expect(result.articles).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });
});

// --- Regressie: een xlsx mag nooit door de PDF-parser gaan -----------------

describe("regressie: juiste parser per bestandstype", () => {
  it("kiest de xlsx-parser voor een stuklijst en niet de PDF-parser", () => {
    // De upload-route stuurde elk analyseerbaar bestand door extractPdfText,
    // waardoor een echte stuklijst faalde met "Invalid PDF structure".
    expect(findParser("xlsx")?.id).toBe("xlsx");
    expect(findParser("xlsm")?.id).toBe("xlsx");
    expect(findParser("pdf")?.id).toBe("pdf");
  });

  it("verwerkt een xlsx zonder PDF-foutmelding", async () => {
    const file = buildXlsx(HEADER, [row("P251411-01", "12620094", "WCD 1-voudig", 10)]);
    const parser = findParser("xlsx")!;

    const result = await parser.parse(file, context);

    expect(result.ok).toBe(true);
    if (!result.ok) expect(result.message).not.toContain("PDF");
  });

  it("kent geen parser toe aan Inventor- en Revit-bestanden", () => {
    for (const type of ["iam", "ipt", "idw", "rvt", "rfa"]) {
      expect(findParser(type)).toBeUndefined();
    }
  });
});
