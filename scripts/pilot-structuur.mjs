/**
 * Kijkt naar de VORM van de uitgelezen tekst, niet naar de inhoud.
 *
 * Bedoeld om vast te stellen of regelgebaseerde herkenning (wat de applicatie nu
 * doet) op dit documenttype kan werken. Draait volledig lokaal.
 *
 * Gebruik: node scripts/pilot-structuur.mjs <pdf> [pagina]
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { extractText, extractTextItems, getDocumentProxy } from "unpdf";

const path = resolve(process.argv[2]);
const pageNumber = Number(process.argv[3] ?? 1);

const buffer = new Uint8Array(await readFile(path));
const proxy = await getDocumentProxy(buffer);
const { text } = await extractText(proxy, { mergePages: false });
const page = text[pageNumber - 1] ?? "";
const lines = page.split("\n").map((l) => l.trim()).filter(Boolean);

console.log(`# ${basename(path)} — pagina ${pageNumber}`);
console.log(`Regels: ${lines.length}, tekens: ${page.length}`);

const lengths = lines.map((l) => l.length).sort((a, b) => a - b);
const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
console.log(`Regellengte: mediaan ${median}, langste ${lengths.at(-1) ?? 0}`);
console.log(`Regels van 1-3 tekens: ${lines.filter((l) => l.length <= 3).length}`);
console.log(`Regels die alleen een getal zijn: ${lines.filter((l) => /^[\d.,]+$/.test(l)).length}`);
console.log(`Regels met >= 3 woorden: ${lines.filter((l) => l.split(/\s+/).length >= 3).length}`);

// Hoe de PDF de tekst positioneert: veel losse items = CAD-export, weinig = lopende tekst.
const items = await extractTextItems(proxy);
const pageItems = items.items[pageNumber - 1] ?? [];
console.log(`\nLosse tekstfragmenten op deze pagina: ${pageItems.length}`);
const withEOL = pageItems.filter((i) => i.hasEOL).length;
console.log(`Fragmenten gevolgd door regeleinde: ${withEOL}`);
const uniqueY = new Set(pageItems.map((i) => Math.round(i.y))).size;
console.log(`Verschillende y-posities (tekstregels op de pagina): ${uniqueY}`);
const avgFrag =
  pageItems.length > 0
    ? Math.round(pageItems.reduce((s, i) => s + i.str.length, 0) / pageItems.length)
    : 0;
console.log(`Gemiddelde fragmentlengte: ${avgFrag} tekens`);

console.log("\nEerste 25 regels, alleen lengte en vorm (geen inhoud):");
for (const line of lines.slice(0, 25)) {
  const vorm = line
    .replace(/[A-Za-zÀ-ÿ]/g, "A")
    .replace(/\d/g, "9")
    .replace(/\s+/g, " ");
  console.log(`  ${String(line.length).padStart(3)}  ${vorm.slice(0, 60)}`);
}
