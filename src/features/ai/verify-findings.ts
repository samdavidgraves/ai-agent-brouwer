import { MAX_FINDINGS, MIN_SOURCE_QUOTE_CHARS } from "@/features/ai/limits";
import type { RawAiFinding } from "@/features/ai/schema";
import type { BomArticle } from "@/features/documents/parsers";
import type {
  CheckArea,
  DocumentRole,
  ConfidenceLevel,
  FindingCategory,
  FindingSeverity,
  FindingType,
} from "@/types/database";

/** Een document zoals het aan een provider is aangeboden. */
export type AnalysisDocument = {
  id: string;
  fileName: string;
  /** Rol die de werkvoorbereider aan het document gaf. */
  role: DocumentRole;
  /**
   * Index 0 is pagina 1. Voor een stuklijst is dit de canonieke weergave van de
   * samengevoegde artikelregels; citaten worden hiertegen geverifieerd.
   */
  pages: string[];
  /** Alleen voor stuklijsten: de gestructureerde artikelregels. */
  articles?: BomArticle[];
  /** Alleen voor stuklijsten: hoeveel subprojecten in de export zitten. */
  subprojectCount?: number;
};

export type VerifiedFinding = {
  finding_type: FindingType;
  check_area: CheckArea;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  source_document_id: string;
  source_reference: string;
  source_quote: string;
  compared_document_id: string | null;
  compared_reference: string | null;
  compared_quote: string | null;
  confidence: ConfidenceLevel;
};

export type RejectedFinding = {
  title: string;
  reason: string;
};

/**
 * Maakt tekst vergelijkbaar tussen PDF-extractie en AI-antwoord: regelafbrekingen,
 * dubbele spaties, zachte afbreekstreepjes en unicode-varianten verdwijnen.
 */
export function normalizeForMatching(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/­/g, "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Zoekt een passage terug in de documenttekst en geeft het paginanummer waarop
 * die begint. `null` betekent: niet gevonden, dus niet controleerbaar.
 *
 * Zoekt eerst per pagina. Lukt dat niet, dan over de hele tekst, zodat een citaat
 * dat over een paginagrens loopt alsnog gevonden wordt.
 */
export function findQuotePage(pages: string[], quote: string): number | null {
  const needle = normalizeForMatching(quote);
  if (!needle) return null;

  const normalized = pages.map(normalizeForMatching);

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index].includes(needle)) return index + 1;
  }

  // Over paginagrenzen heen zoeken.
  const offsets: number[] = [];
  let combined = "";
  for (const page of normalized) {
    offsets.push(combined.length);
    combined += (combined ? " " : "") + page;
  }

  const position = combined.indexOf(needle);
  if (position === -1) return null;

  let page = 1;
  for (let index = 0; index < offsets.length; index += 1) {
    if (offsets[index] <= position) page = index + 1;
  }
  return page;
}

/**
 * Controleert elke bevinding van de AI tegen de werkelijke documenttekst.
 *
 * Een bevinding wordt verworpen wanneer de bron niet te herleiden is: onbekend
 * documentnummer, te kort of leeg citaat, of een citaat dat niet letterlijk in het
 * document terug te vinden is. Dat laatste is de belangrijkste controle — het is de
 * rem op verzonnen bevindingen.
 *
 * Het paginanummer komt uit de vindplaats, niet uit het AI-antwoord.
 */
export function verifyFindings(
  raw: RawAiFinding[],
  documents: AnalysisDocument[],
): { accepted: VerifiedFinding[]; rejected: RejectedFinding[] } {
  const accepted: VerifiedFinding[] = [];
  const rejected: RejectedFinding[] = [];

  for (const finding of raw) {
    const title = finding.title.trim();
    const description = finding.description.trim();
    const quote = finding.source_quote.trim();
    const label = title || "(bevinding zonder titel)";

    if (accepted.length >= MAX_FINDINGS) {
      rejected.push({ title: label, reason: `meer dan ${MAX_FINDINGS} bevindingen` });
      continue;
    }

    if (!title || !description) {
      rejected.push({ title: label, reason: "titel of uitleg ontbreekt" });
      continue;
    }

    const document = documents[finding.source_document_index - 1];
    if (!document) {
      rejected.push({
        title: label,
        reason: `verwijst naar document ${finding.source_document_index}, dat niet bestaat`,
      });
      continue;
    }

    if (normalizeForMatching(quote).length < MIN_SOURCE_QUOTE_CHARS) {
      rejected.push({ title: label, reason: "bronpassage te kort om te controleren" });
      continue;
    }

    const page = findQuotePage(document.pages, quote);
    if (page === null) {
      rejected.push({
        title: label,
        reason: `bronpassage niet terug te vinden in ${document.fileName}`,
      });
      continue;
    }

    // Tweede bron. Ook dit citaat moet letterlijk terugvindbaar zijn; is het dat
    // niet, dan laten we de tweede bron vallen in plaats van de hele bevinding te
    // verwerpen. De primaire bron draagt de bewijslast en blijft geldig.
    const comparedIndex = finding.compared_document_index;
    const compared =
      comparedIndex !== null && comparedIndex !== finding.source_document_index
        ? documents[comparedIndex - 1]
        : undefined;

    let comparedId: string | null = null;
    let comparedReference: string | null = null;
    let comparedQuote: string | null = null;

    if (compared) {
      const secondQuote = finding.compared_quote.trim();
      const longEnough = normalizeForMatching(secondQuote).length >= MIN_SOURCE_QUOTE_CHARS;
      const secondPage = longEnough ? findQuotePage(compared.pages, secondQuote) : null;

      if (secondPage !== null) {
        comparedId = compared.id;
        comparedReference = `Pagina ${secondPage}`;
        comparedQuote = secondQuote;
      }
      // Zonder controleerbaar citaat leggen we geen tweede document vast: de
      // database eist dat die twee samen bestaan.
    }

    accepted.push({
      finding_type: finding.finding_type,
      check_area: finding.check_area,
      severity: finding.severity,
      category: finding.category,
      title,
      description,
      source_document_id: document.id,
      source_reference: `Pagina ${page}`,
      source_quote: quote,
      compared_document_id: comparedId,
      compared_reference: comparedReference,
      compared_quote: comparedQuote,
      confidence: finding.confidence,
    });
  }

  return { accepted, rejected };
}
