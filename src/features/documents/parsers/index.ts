import { PdfParser } from "./pdf-parser";
import { XlsxParser } from "./xlsx-parser";
import type { DocumentParser } from "./types";

export type { BomArticle, DocumentParser, ParseContext, ParsedDocument, ParseResult } from "./types";
export { PdfParser } from "./pdf-parser";
export { XlsxParser } from "./xlsx-parser";

/**
 * Alle beschikbare parsers. Een bestandstype dat hier niet in staat wordt wel
 * opgeslagen, maar niet geanalyseerd.
 *
 * Een nieuw formaat toevoegen betekent: DocumentParser implementeren en hier
 * registreren. De analyse-engine hoeft niet te veranderen.
 */
export const PARSERS: DocumentParser[] = [new PdfParser(), new XlsxParser()];

export function findParser(fileType: string): DocumentParser | undefined {
  return PARSERS.find((parser) => parser.fileTypes.includes(fileType));
}

/** Bestandstypen waarvoor een parser bestaat. */
export function parsableFileTypes(): string[] {
  return [...new Set(PARSERS.flatMap((parser) => [...parser.fileTypes]))].sort();
}
