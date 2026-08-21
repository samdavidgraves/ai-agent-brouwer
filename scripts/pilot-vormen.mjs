/**
 * Typeert de vectorvormen op een tekeningpagina.
 *
 * Doel: vaststellen of symbolen (WCD = lijn met halve maan, plafonnière = cirkel
 * met kruis) als herkenbare geometrische vormen in de PDF zitten. Lokaal, alleen lezen.
 *
 * Gebruik: node scripts/pilot-vormen.mjs <pdf> [pagina]
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

const path = resolve(process.argv[2]);
const pageNumber = Number(process.argv[3] ?? 1);

const pdfjs = await getResolvedPDFJS();
const { OPS } = pdfjs;

/**
 * Een subpad is een platte reeks: opcode, coördinaten, opcode, coördinaten…
 * 0 = moveTo (2), 1 = lineTo (2), 2 = curveTo (6), 3 = curveTo2 (4),
 * 4 = closePath (0), 5 = rectangle (4). Aantallen volgen pdf.js.
 */
const ARITY = { 0: 2, 1: 2, 2: 6, 3: 4, 4: 0, 5: 4 };

function decodeSubpath(flat) {
  const segments = [];
  const points = [];
  let i = 0;
  while (i < flat.length) {
    const op = flat[i];
    const n = ARITY[op];
    if (n === undefined) break;
    const coords = [];
    for (let k = 0; k < n; k += 2) {
      const x = flat[i + 1 + k];
      const y = flat[i + 2 + k];
      coords.push([x, y]);
      points.push([x, y]);
    }
    segments.push({ op, coords });
    i += 1 + n;
  }
  return { segments, points };
}

function classify(shape) {
  const { curves, lines, closed, w, h } = shape;
  const ratio = h > 0 ? w / h : 0;
  const vierkant = ratio > 0.8 && ratio < 1.25;

  if (curves >= 4 && vierkant && closed) return "cirkel (4+ bogen, gesloten, vierkant kader)";
  if (curves >= 2 && curves < 4 && vierkant) return "halve/kwart boog";
  if (curves >= 1 && curves < 4) return "boogje";
  if (curves === 0 && lines === 1) return "enkele lijn";
  if (curves === 0 && lines === 2 && !closed) return "twee lijnen (kruis-kandidaat)";
  if (curves === 0 && lines === 4 && closed) return "rechthoek";
  if (curves === 0 && lines > 4) return `veelhoek (${lines} lijnen)`;
  return `overig (l${lines} c${curves})`;
}

const buffer = new Uint8Array(await readFile(path));
const proxy = await getDocumentProxy(buffer);
const page = await proxy.getPage(pageNumber);
const opList = await page.getOperatorList();

const shapes = [];

for (let i = 0; i < opList.fnArray.length; i++) {
  if (opList.fnArray[i] !== OPS.constructPath) continue;
  const subpaths = opList.argsArray[i]?.[1] ?? [];

  for (const flat of subpaths) {
    if (!flat || typeof flat.length !== "number") continue;
    const { segments, points } = decodeSubpath(flat);
    if (points.length === 0) continue;

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    const shape = {
      curves: segments.filter((s) => s.op === 2 || s.op === 3).length,
      lines: segments.filter((s) => s.op === 1).length,
      closed: segments.some((s) => s.op === 4),
      rects: segments.filter((s) => s.op === 5).length,
      w,
      h,
      x: Math.min(...xs),
      y: Math.min(...ys),
    };
    shape.type = classify(shape);
    shapes.push(shape);
  }
}

console.log(`# ${basename(path)} — pagina ${pageNumber}`);
console.log(`Subpaden ontleed: ${shapes.length}\n`);

const perType = new Map();
for (const s of shapes) {
  const e = perType.get(s.type) ?? { type: s.type, count: 0, sizes: [] };
  e.count += 1;
  if (e.sizes.length < 200) e.sizes.push([s.w, s.h]);
  perType.set(s.type, e);
}

console.log("Vormtypen:");
for (const e of [...perType.values()].sort((a, b) => b.count - a.count)) {
  const ws = e.sizes.map((s) => s[0]);
  const mediaan = ws.length ? ws.sort((a, b) => a - b)[Math.floor(ws.length / 2)] : 0;
  console.log(`  ${String(e.count).padStart(6)}x  ${e.type.padEnd(46)} mediane breedte ${mediaan.toFixed(1)}`);
}

// Symboolkandidaten: kleine vormen met rondingen. Symbolen op een tekening zijn
// klein ten opzichte van de constructielijnen.
const metBoog = shapes.filter((s) => s.curves > 0);
console.log(`\nVormen met rondingen: ${metBoog.length}`);

if (metBoog.length) {
  const breedtes = metBoog.map((s) => s.w).sort((a, b) => a - b);
  const p = (q) => breedtes[Math.floor(breedtes.length * q)]?.toFixed(1);
  console.log(`  breedte p10=${p(0.1)} p50=${p(0.5)} p90=${p(0.9)} max=${breedtes.at(-1)?.toFixed(1)}`);

  const clusters = new Map();
  for (const s of metBoog) {
    const key = `${s.curves} bogen, ~${Math.round(s.w / 5) * 5}x${Math.round(s.h / 5) * 5}`;
    clusters.set(key, (clusters.get(key) ?? 0) + 1);
  }
  console.log("\n  Terugkerende ronde vormen (kandidaat-symbolen):");
  for (const [key, count] of [...clusters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${String(count).padStart(5)}x  ${key}`);
  }
}

await page.cleanup();
