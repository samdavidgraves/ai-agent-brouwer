/**
 * Onderzoekt HOE een tekening-PDF zijn symbolen opbouwt.
 *
 * Dat bepaalt of symboolherkenning (WCD = lijn met halve maan, plafonnière =
 * cirkel met kruis) technisch haalbaar is, en met welke techniek:
 *
 *  - vectorpaden      -> geometrische patroonherkenning mogelijk, zonder AI
 *  - lettertype-glyph -> triviaal, symbool komt als teken uit de tekstlaag
 *  - rasterafbeelding -> alleen met beeldherkenning
 *
 * Lokaal, alleen lezen. Gebruik:
 *   node scripts/pilot-symbolen.mjs <pdf> [pagina]
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

const path = resolve(process.argv[2]);
const pageNumber = Number(process.argv[3] ?? 1);

const pdfjs = await getResolvedPDFJS();
const { OPS } = pdfjs;

const buffer = new Uint8Array(await readFile(path));
const proxy = await getDocumentProxy(buffer);
const page = await proxy.getPage(pageNumber);

const opList = await page.getOperatorList();

// Welke tekenopdrachten komen voor, en hoe vaak?
const namesByCode = new Map(Object.entries(OPS).map(([name, code]) => [code, name]));
const tally = new Map();
for (const fn of opList.fnArray) {
  const name = namesByCode.get(fn) ?? `onbekend(${fn})`;
  tally.set(name, (tally.get(name) ?? 0) + 1);
}

console.log(`# ${basename(path)} — pagina ${pageNumber}`);
console.log(`Tekenopdrachten totaal: ${opList.fnArray.length}\n`);

console.log("Meest voorkomende opdrachten:");
for (const [name, count] of [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
  console.log(`  ${String(count).padStart(6)}x  ${name}`);
}

// --- Vectorpaden ontleden --------------------------------------------------
//
// constructPath krijgt een lijst deelopdrachten mee (moveTo, lineTo, curveTo,
// rectangle, closePath). De samenstelling daarvan verraadt de vorm: een cirkel is
// in PDF vrijwel altijd vier bezierbogen, een kruis twee losse lijnen.

const pathShapes = [];
for (let i = 0; i < opList.fnArray.length; i++) {
  if (opList.fnArray[i] !== OPS.constructPath) continue;
  const args = opList.argsArray[i];
  const ops = args?.[0] ?? [];
  const coords = args?.[1] ?? [];

  const counts = { moveTo: 0, lineTo: 0, curveTo: 0, rect: 0, close: 0, overig: 0 };
  for (const op of ops) {
    if (op === OPS.moveTo) counts.moveTo += 1;
    else if (op === OPS.lineTo) counts.lineTo += 1;
    else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) counts.curveTo += 1;
    else if (op === OPS.rectangle) counts.rect += 1;
    else if (op === OPS.closePath) counts.close += 1;
    else counts.overig += 1;
  }

  // Begrenzend kader, om de grootte van de vorm te kennen.
  const xs = [];
  const ys = [];
  for (let c = 0; c + 1 < coords.length; c += 2) {
    xs.push(coords[c]);
    ys.push(coords[c + 1]);
  }
  const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;

  pathShapes.push({ counts, width, height, points: xs.length });
}

console.log(`\nVectorpaden: ${pathShapes.length}`);

if (pathShapes.length) {
  const signature = new Map();
  for (const shape of pathShapes) {
    const key = `m${shape.counts.moveTo} l${shape.counts.lineTo} c${shape.counts.curveTo} r${shape.counts.rect}`;
    const entry = signature.get(key) ?? { key, count: 0, sizes: [] };
    entry.count += 1;
    if (entry.sizes.length < 60) {
      entry.sizes.push(`${Math.round(shape.width)}x${Math.round(shape.height)}`);
    }
    signature.set(key, entry);
  }

  console.log("\nVormsignaturen (m=moveTo, l=lineTo, c=curve, r=rechthoek):");
  for (const e of [...signature.values()].sort((a, b) => b.count - a.count).slice(0, 15)) {
    const maten = [...new Set(e.sizes)].slice(0, 6).join(", ");
    console.log(`  ${String(e.count).padStart(6)}x  ${e.key.padEnd(22)} maten: ${maten}`);
  }

  // Rondingen zijn de sterkste aanwijzing voor symbolen als cirkels en halve manen.
  const metCurve = pathShapes.filter((s) => s.counts.curveTo > 0);
  console.log(`\nPaden met rondingen (kandidaat cirkel/halve maan): ${metCurve.length}`);
  const perCurve = new Map();
  for (const s of metCurve) {
    const k = s.counts.curveTo;
    perCurve.set(k, (perCurve.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...perCurve.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${String(v).padStart(6)} paden met ${k} bezierboog(en)`);
  }
}

// --- Afbeeldingen ----------------------------------------------------------
const imageOps = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]
  .map((code) => namesByCode.get(code))
  .filter(Boolean);
const imageCount = imageOps.reduce((sum, name) => sum + (tally.get(name) ?? 0), 0);
console.log(`\nRasterafbeeldingen op deze pagina: ${imageCount}`);

// --- Lettertypen -----------------------------------------------------------
const fonts = new Set();
for (let i = 0; i < opList.fnArray.length; i++) {
  if (opList.fnArray[i] === OPS.setFont) fonts.add(opList.argsArray[i]?.[0]);
}
console.log(`Gebruikte lettertypen: ${[...fonts].join(", ") || "geen"}`);

await page.cleanup();
