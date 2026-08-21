/**
 * Proef: zijn tekeningsymbolen geometrisch herkenbaar?
 *
 * Zoekt cirkels (vier bezierbogen) en toetst of er lijnen door het middelpunt
 * lopen — het patroon van een plafonnière (cirkel met kruis). Houdt daarbij de
 * transformatiematrix bij, zodat maten en posities in echte paginapunten staan.
 *
 * Dit is onderzoek naar haalbaarheid, geen productiecode. Lokaal, alleen lezen.
 *
 * Gebruik: node scripts/pilot-symboolproef.mjs <pdf> [pagina]
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

const path = resolve(process.argv[2]);
const pageNumber = Number(process.argv[3] ?? 1);

const pdfjs = await getResolvedPDFJS();
const { OPS } = pdfjs;

const ARITY = { 0: 2, 1: 2, 2: 6, 3: 4, 4: 0, 5: 4 };

/** [a b c d e f] · punt */
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

const buffer = new Uint8Array(await readFile(path));
const proxy = await getDocumentProxy(buffer);
const page = await proxy.getPage(pageNumber);
const opList = await page.getOperatorList();

let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
const shapes = [];

for (let i = 0; i < opList.fnArray.length; i++) {
  const fn = opList.fnArray[i];
  const args = opList.argsArray[i];

  if (fn === OPS.save) {
    stack.push([...ctm]);
    continue;
  }
  if (fn === OPS.restore) {
    ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    continue;
  }
  if (fn === OPS.transform) {
    ctm = multiply(ctm, args);
    continue;
  }
  if (fn !== OPS.constructPath) continue;

  for (const flat of args?.[1] ?? []) {
    if (!flat || typeof flat.length !== "number") continue;

    const points = [];
    const segs = [];
    let k = 0;
    while (k < flat.length) {
      const op = flat[k];
      const n = ARITY[op];
      if (n === undefined) break;
      const pts = [];
      for (let c = 0; c < n; c += 2) {
        pts.push(apply(ctm, flat[k + 1 + c], flat[k + 2 + c]));
      }
      points.push(...pts);
      segs.push({ op, pts });
      k += 1 + n;
    }
    if (points.length === 0) continue;

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    shapes.push({
      curves: segs.filter((s) => s.op === 2 || s.op === 3).length,
      lines: segs.filter((s) => s.op === 1).length,
      closed: segs.some((s) => s.op === 4),
      segs,
      w: maxX - minX,
      h: maxY - minY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    });
  }
}

console.log(`# ${basename(path)} — pagina ${pageNumber}`);
console.log(`Subpaden: ${shapes.length}\n`);

// Cirkel: vier bezierbogen, ongeveer vierkant kader, zichtbare maat.
const cirkels = shapes.filter(
  (s) => s.curves >= 4 && s.w > 1 && s.h > 1 && s.w / s.h > 0.85 && s.w / s.h < 1.18,
);
console.log(`Cirkels (4+ bogen, vierkant kader, >1pt): ${cirkels.length}`);

const perMaat = new Map();
for (const c of cirkels) {
  const key = (Math.round(c.w * 2) / 2).toFixed(1);
  perMaat.set(key, (perMaat.get(key) ?? 0) + 1);
}
console.log("  verdeling naar diameter (punten):");
for (const [maat, count] of [...perMaat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(count).padStart(4)}x  ${maat} pt`);
}

// Lijnstukken los verzamelen, om te toetsen of er lijnen door een cirkelmiddelpunt lopen.
const lijnen = [];
for (const s of shapes) {
  for (const seg of s.segs) {
    if (seg.op !== 1) continue;
    lijnen.push(seg.pts[0]);
  }
}

console.log(`\nLijnpunten beschikbaar: ${lijnen.length}`);

// Plafonnière-kandidaat: cirkel met minstens twee lijnpunten binnen de straal.
let metKruis = 0;
const voorbeelden = [];
for (const c of cirkels) {
  const straal = c.w / 2;
  let binnen = 0;
  for (const [lx, ly] of lijnen) {
    if (Math.abs(lx - c.cx) <= straal && Math.abs(ly - c.cy) <= straal) binnen += 1;
    if (binnen >= 4) break;
  }
  if (binnen >= 2) {
    metKruis += 1;
    if (voorbeelden.length < 8) {
      voorbeelden.push(`d=${c.w.toFixed(1)}pt op (${c.cx.toFixed(0)}, ${c.cy.toFixed(0)}) — ${binnen} lijnpunten binnen`);
    }
  }
}

console.log(`\nCirkels met >= 2 lijnpunten erbinnen (plafonnière-kandidaat): ${metKruis}`);
for (const v of voorbeelden) console.log(`  ${v}`);

// Halve maan: precies twee bogen, niet gesloten.
const bogen = shapes.filter((s) => s.curves === 2 && !s.closed && s.w > 1);
console.log(`\nLosse dubbele bogen (halve-maan-kandidaat, >1pt): ${bogen.length}`);
const boogMaten = new Map();
for (const b of bogen) {
  const key = `${(Math.round(b.w * 2) / 2).toFixed(1)}x${(Math.round(b.h * 2) / 2).toFixed(1)}`;
  boogMaten.set(key, (boogMaten.get(key) ?? 0) + 1);
}
for (const [maat, count] of [...boogMaten.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(count).padStart(4)}x  ${maat} pt`);
}

await page.cleanup();
