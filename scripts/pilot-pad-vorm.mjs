/**
 * Toont hoe deze pdf.js-versie vectorpaden aanlevert, en probeert daarna de
 * vormen te typeren. Lokaal, alleen lezen.
 *
 * Gebruik: node scripts/pilot-pad-vorm.mjs <pdf> [pagina]
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

console.log(`# ${basename(path)} — pagina ${pageNumber}`);

// Eerst: hoe ziet een constructPath-argument er hier uit?
const first = opList.fnArray.findIndex((fn) => fn === OPS.constructPath);
const sample = opList.argsArray[first];
console.log(`\nVorm van constructPath-argumenten:`);
console.log(`  aantal argumenten: ${Array.isArray(sample) ? sample.length : "geen array"}`);
if (Array.isArray(sample)) {
  sample.forEach((arg, i) => {
    const type = Array.isArray(arg)
      ? `array(${arg.length})`
      : ArrayBuffer.isView(arg)
        ? `${arg.constructor.name}(${arg.length})`
        : typeof arg;
    let preview = "";
    if (Array.isArray(arg) || ArrayBuffer.isView(arg)) {
      preview = ` -> ${[...arg].slice(0, 10).map((v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)).join(", ")}`;
    } else if (typeof arg === "object" && arg !== null) {
      preview = ` -> keys: ${Object.keys(arg).join(", ")}`;
    } else {
      preview = ` -> ${arg}`;
    }
    console.log(`  [${i}] ${type}${preview}`);
  });
}

// Welke deelopdracht-codes komen voor in het eerste argument?
const opNames = new Map(Object.entries(OPS).map(([n, c]) => [c, n]));
const subOps = new Map();
let paths = 0;

for (let i = 0; i < opList.fnArray.length; i++) {
  if (opList.fnArray[i] !== OPS.constructPath) continue;
  paths += 1;
  const args = opList.argsArray[i];
  const ops = args?.[0];
  if (!ops || typeof ops[Symbol.iterator] !== "function") continue;
  for (const code of ops) {
    const name = opNames.get(code) ?? `code${code}`;
    subOps.set(name, (subOps.get(name) ?? 0) + 1);
  }
}

console.log(`\nVectorpaden: ${paths}`);
console.log("Deelopdrachten binnen paden:");
for (const [name, count] of [...subOps.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(7)}x  ${name}`);
}

await page.cleanup();
