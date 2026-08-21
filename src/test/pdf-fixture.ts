/**
 * Bouwt een echte, geldige PDF met tekst, zodat de extractietest de werkelijke
 * PDF-parser uitoefent in plaats van een nagebootste. Bewust alleen ASCII: dan is
 * de tekenlengte gelijk aan de bytelengte en kloppen de xref-offsets.
 */

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/g, (character) => `\\${character}`);
}

function contentStream(lines: string[]): string {
  const body = lines
    .map((line, index) =>
      index === 0
        ? `BT /F1 12 Tf 72 720 Td (${escapePdfText(line)}) Tj`
        : `T* (${escapePdfText(line)}) Tj`,
    )
    .join("\n");
  return `BT /F1 12 Tf 14 TL 72 720 Td\n${body.replace(/^BT \/F1 12 Tf 72 720 Td /, "")}\nET`;
}

/** Maakt een PDF waarin elke `page` een lijst tekstregels is. */
export function createTextPdf(pages: string[][]): Uint8Array {
  if (pages.length === 0) throw new Error("Een PDF heeft minimaal één pagina nodig.");

  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);
  const objects: string[] = [];

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  for (const [index, lines] of pages.entries()) {
    const contentNumber = 5 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNumber} 0 R ` +
        `/Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    const stream = contentStream(lines);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const [index, body] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
