/**
 * Toont de eerste regels van pagina 1 van elke PDF, om de documentrol te bepalen.
 * Lokaal, alleen lezen.
 *
 * Gebruik: node scripts/pilot-kop.mjs <map> [aantalRegels]
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const dir = resolve(process.argv[2]);
const count = Number(process.argv[3] ?? 12);

for (const entry of (await readdir(dir)).sort()) {
  if (extname(entry).toLowerCase() !== ".pdf") continue;

  const buffer = new Uint8Array(await readFile(join(dir, entry)));
  const proxy = await getDocumentProxy(buffer);
  const { text } = await extractText(proxy, { mergePages: false });
  const lines = (text[0] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  console.log(`\n=== ${basename(entry)} ===`);
  for (const line of lines.slice(0, count)) console.log(`  ${line}`);
}
