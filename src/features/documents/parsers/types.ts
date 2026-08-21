import type { DocumentRole } from "@/types/database";

/**
 * Eén artikelregel uit een stuklijst, samengevoegd over alle rijen die hetzelfde
 * artikel binnen hetzelfde subproject noemen.
 */
export type BomArticle = {
  articleNumber: string;
  description: string;
  unit: string;
  /** Totaal over alle subprojecten heen. */
  totalAmount: number;
  /** Aantal per subproject, bijvoorbeeld P251411-01 -> 3. */
  perSubproject: Map<string, number>;
  /** Hoeveel bronregels hierin zijn samengevoegd. */
  rowCount: number;
};

/** Wat een parser oplevert. Voor tekst en voor gestructureerde bronnen dezelfde vorm. */
export type ParsedDocument = {
  kind: "text" | "spreadsheet";
  /**
   * Tekstweergave per pagina. Voor een PDF is dit de echte paginatekst; voor een
   * stuklijst is dit een canonieke weergave van de samengevoegde artikelregels.
   *
   * Dit is altijd de tekst waartegen bronverificatie plaatsvindt: een citaat moet
   * hierin letterlijk terug te vinden zijn. Daarom moet de weergave stabiel zijn.
   */
  pages: string[];
  /** Alleen voor stuklijsten. */
  articles?: BomArticle[];
  /** Subprojecten die in de bron voorkomen, bijvoorbeeld 100 schaftwagens. */
  subprojects?: string[];
  meta: {
    pageCount: number;
    /** Aantal bronregels dat is verwerkt, voor stuklijsten. */
    rowCount?: number;
    truncated: boolean;
    /** Toelichting wanneer er iets bijzonders is aan de verwerking. */
    note?: string;
  };
};

export type ParseResult =
  | { ok: true; document: ParsedDocument }
  | { ok: false; message: string };

/**
 * Een parser zet ruwe bytes om in een ParsedDocument.
 *
 * Parsers weten niet waar de bytes vandaan komen. Daardoor werkt dezelfde parser
 * straks ook op bestanden die uit het Brouwer-intranet worden opgehaald.
 */
export interface DocumentParser {
  readonly id: string;
  /** Bestandstypen zonder punt, bijvoorbeeld "pdf" of "xlsx". */
  readonly fileTypes: readonly string[];
  parse(data: Uint8Array, context: ParseContext): Promise<ParseResult>;
}

export type ParseContext = {
  fileName: string;
  role: DocumentRole;
  /** Bovengrens voor de tekstweergave, om geheugen te begrenzen. */
  maxChars: number;
};
