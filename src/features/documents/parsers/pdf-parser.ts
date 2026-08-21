import { extractText } from "unpdf";

import { joinPages, splitPages } from "@/features/documents/extract-pdf";
import type { DocumentParser, ParseContext, ParseResult } from "./types";

/**
 * Tekstextractie uit vectoriële PDF's.
 *
 * Bewust geen OCR en geen symboolherkenning: eerst de tekstlaag, die in de
 * Brouwer-tekeningen aanwezig en schoon is. Levert dezelfde paginastructuur als
 * voorheen, zodat bronverwijzingen naar pagina's blijven kloppen.
 */
export class PdfParser implements DocumentParser {
  readonly id = "pdf";
  readonly fileTypes = ["pdf"] as const;

  async parse(data: Uint8Array, context: ParseContext): Promise<ParseResult> {
    try {
      const { text } = await extractText(data, { mergePages: false });
      const joined = joinPages(text, context.maxChars);

      return {
        ok: true,
        document: {
          kind: "text",
          pages: splitPages(joined.text),
          meta: {
            pageCount: joined.pageCount,
            truncated: joined.truncated,
          },
        },
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "De PDF kon niet worden gelezen.",
      };
    }
  }
}
