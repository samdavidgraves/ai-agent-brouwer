/**
 * PDF-specifieke hulpfuncties. Het downloaden en opslaan van documentinhoud staat
 * in extract-content.ts en gaat via het parserregister, zodat elk bestandstype de
 * juiste parser krijgt.
 */

import { extractText } from "unpdf";

import { MAX_EXTRACTED_CHARS } from "@/features/ai/limits";

export type ExtractionResult = {
  text: string;
  pageCount: number;
  truncated: boolean;
};

/** Paginamarkering in de opgeslagen tekst. Ook gebruikt om de tekst weer per pagina te splitsen. */
export function pageMarker(pageNumber: number): string {
  return `[pagina ${pageNumber}]`;
}

/**
 * Voegt paginateksten samen tot één string met paginamarkeringen, en kapt af op
 * `maxChars`. De markeringen zijn nodig om bevindingen later aan een pagina te
 * kunnen koppelen.
 */
export function joinPages(pages: string[], maxChars = MAX_EXTRACTED_CHARS): ExtractionResult {
  const parts: string[] = [];
  let length = 0;
  let truncated = false;

  for (let index = 0; index < pages.length; index += 1) {
    const header = pageMarker(index + 1);
    const body = pages[index].replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const block = `${header}\n${body}`;

    if (length + block.length > maxChars) {
      const room = maxChars - length - header.length - 1;
      if (room > 0) parts.push(`${header}\n${body.slice(0, room)}`);
      truncated = true;
      break;
    }

    parts.push(block);
    length += block.length + 2;
  }

  return {
    text: parts.join("\n\n"),
    pageCount: pages.length,
    truncated,
  };
}

/** Leest een PDF uit een buffer en geeft de tekst per pagina terug. */
export async function extractPdfText(
  data: Uint8Array,
  maxChars = MAX_EXTRACTED_CHARS,
): Promise<ExtractionResult> {
  const { text } = await extractText(data, { mergePages: false });
  return joinPages(text, maxChars);
}

/** Splitst opgeslagen tekst terug op in pagina's. Index 0 is pagina 1. */
export function splitPages(text: string): string[] {
  const pages: string[] = [];
  const pattern = /^\[pagina (\d+)\]$/gm;
  const matches = [...text.matchAll(pattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    pages.push(text.slice(start, end).trim());
  }

  return pages;
}
