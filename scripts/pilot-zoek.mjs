/**
 * Zoekt naar aanwijzingen voor een stuklijst/onderdelentabel in een PDF.
 * Lokaal, alleen lezen.
 *
 * Gebruik: node scripts/pilot-zoek.mjs <pdf> <zoekterm> [contextRegels]
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const path = resolve(process.argv[2]);
const term = (process.argv[3] ?? "").toLowerCase();
const context = Number(process.argv[4] ?? 2);

const buffer = new Uint8Array(await readFile(path));
const proxy = await getDocumentProxy(buffer);
const { text } = await extractText(proxy, { mergePages: false });

console.log(`# ${basename(path)} — zoek: "${term}"`);
let treffers = 0;

text.forEach((page, pageIndex) => {
  const lines = page.split("\n").map((l) => l.trim());
  lines.forEach((line, index) => {
    if (!line.toLowerCase().includes(term)) return;
    treffers += 1;
    console.log(`\n-- pagina ${pageIndex + 1}, regel ${index + 1}`);
    for (let i = Math.max(0, index - context); i <= Math.min(lines.length - 1, index + context); i++) {
      console.log(`${i === index ? " >" : "  "} ${lines[i]}`);
    }
  });
});

console.log(`\nTotaal treffers: ${treffers}`);
