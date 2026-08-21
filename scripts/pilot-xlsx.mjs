/**
 * Leest een .xlsx lokaal uit zonder extra dependency.
 *
 * Een xlsx is een ZIP met XML erin. Windows kan uitpakken (Expand-Archive); dit
 * script leest daarna de uitgepakte XML. Bedoeld voor onderzoek naar wat er in een
 * stuklijst-export staat, niet als parser voor de applicatie.
 *
 * Gebruik:
 *   node scripts/pilot-xlsx.mjs <map-met-uitgepakte-xlsx> [--rijen N] [--kolom C]
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2]);
const args = process.argv.slice(3);
const rowLimit = Number(args[args.indexOf("--rijen") + 1] || 25);
const columnFilter = args.includes("--kolom") ? args[args.indexOf("--kolom") + 1] : null;
const searchTerm = args.includes("--zoek") ? args[args.indexOf("--zoek") + 1].toLowerCase() : null;

function decode(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/** sharedStrings.xml bevat de tekstwaarden; cellen verwijzen ernaar met een index. */
async function readSharedStrings() {
  let xml;
  try {
    xml = await readFile(join(dir, "xl", "sharedStrings.xml"), "utf8");
  } catch {
    return [];
  }
  const strings = [];
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    // Een cel kan uit meerdere tekstfragmenten bestaan (opmaak); plak ze aaneen.
    const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]));
    strings.push(parts.join(""));
  }
  return strings;
}

function columnOf(ref) {
  return (ref.match(/^[A-Z]+/) ?? [""])[0];
}

async function main() {
  const shared = await readSharedStrings();
  const xml = await readFile(join(dir, "xl", "worksheets", "sheet1.xml"), "utf8");

  const rows = [];
  const columnsSeen = new Set();

  for (const rowXml of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const rowNumber = Number((rowXml.match(/ r="(\d+)"/) ?? [, "0"])[1]);
    const cells = {};

    for (const cellXml of rowXml.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = (cellXml.match(/ r="([A-Z]+\d+)"/) ?? [, ""])[1];
      if (!ref) continue;
      const type = (cellXml.match(/ t="([^"]+)"/) ?? [, ""])[1];
      const raw = (cellXml.match(/<v>([\s\S]*?)<\/v>/) ?? [, ""])[1];
      const inline = (cellXml.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) ?? [, ""])[1];

      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = decode(inline);
      else value = decode(raw);

      if (value !== "") {
        const col = columnOf(ref);
        cells[col] = value;
        columnsSeen.add(col);
      }
    }

    if (Object.keys(cells).length > 0) rows.push({ rowNumber, cells });
  }

  const columns = [...columnsSeen].sort(
    (a, b) => a.length - b.length || a.localeCompare(b),
  );

  console.log(`Rijen met inhoud: ${rows.length}`);
  console.log(`Kolommen in gebruik: ${columns.join(", ")}`);
  console.log(`Unieke teksten in sharedStrings: ${shared.length}`);

  if (columnFilter) {
    const values = rows
      .map((r) => r.cells[columnFilter])
      .filter((v) => v !== undefined);
    const uniek = new Map();
    for (const v of values) uniek.set(v, (uniek.get(v) ?? 0) + 1);
    console.log(`\nKolom ${columnFilter}: ${values.length} waarden, ${uniek.size} uniek`);
    for (const [value, count] of [...uniek.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      console.log(`  ${String(count).padStart(5)}x  ${value}`);
    }
    return;
  }

  if (searchTerm) {
    // Kolomnamen uit de kopregel halen, zodat we op naam kunnen werken.
    const header = rows[0]?.cells ?? {};
    const colOf = (naam) =>
      Object.keys(header).find((c) => (header[c] ?? "").toLowerCase() === naam);
    const cDesc = colOf("article_description");
    const cNum = colOf("article_number");
    const cAmount = colOf("amount");
    const cUnit = colOf("article_unit");
    const cProject = colOf("project");

    const subProjects = new Set(
      rows.slice(1).map((r) => r.cells[cProject]).filter(Boolean),
    );

    const perArticle = new Map();
    for (const row of rows.slice(1)) {
      const desc = row.cells[cDesc];
      if (!desc || !desc.toLowerCase().includes(searchTerm)) continue;
      const key = `${row.cells[cNum] ?? "-"}|${desc}`;
      const entry = perArticle.get(key) ?? {
        number: row.cells[cNum] ?? "-",
        desc,
        unit: row.cells[cUnit] ?? "",
        total: 0,
        rows: 0,
      };
      entry.total += Number(row.cells[cAmount] ?? 0) || 0;
      entry.rows += 1;
      perArticle.set(key, entry);
    }

    console.log(`\nZoekterm "${searchTerm}" in article_description`);
    console.log(`Sub-projecten in de export: ${subProjects.size}`);
    console.log("");
    for (const e of [...perArticle.values()].sort((a, b) => b.total - a.total)) {
      const perUnit = subProjects.size ? (e.total / subProjects.size).toFixed(2) : "?";
      console.log(
        `  ${String(e.number).padEnd(12)} totaal ${String(e.total).padStart(7)} ${e.unit.padEnd(4)} | per sub-project ${perUnit.padStart(7)} | ${e.rows} regels`,
      );
      console.log(`               ${e.desc}`);
    }
    if (perArticle.size === 0) console.log("  geen treffers");
    return;
  }

  console.log(`\nEerste ${rowLimit} rijen met inhoud:`);
  for (const row of rows.slice(0, rowLimit)) {
    const parts = columns
      .filter((c) => row.cells[c] !== undefined)
      .map((c) => `${c}=${row.cells[c]}`);
    console.log(`  r${String(row.rowNumber).padStart(4)}  ${parts.join(" | ")}`);
  }
}

await main();
