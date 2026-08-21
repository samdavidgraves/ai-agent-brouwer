/**
 * Harde grenzen voor de AI-keten. Op één plek, zodat geheugengebruik en
 * API-kosten voorspelbaar blijven.
 */

/** Maximum aantal tekens dat per document wordt opgeslagen. Daarboven wordt afgekapt. */
export const MAX_EXTRACTED_CHARS = 200_000;

/** Maximum aantal tekens dat in totaal naar de AI gaat, over alle documenten samen. */
export const MAX_ANALYSIS_CHARS = 400_000;

/** Documenten met minder tekst dan dit bevatten vermoedelijk alleen scans of tekeningen. */
export const MIN_USABLE_CHARS = 40;

/** Minimale lengte van een bronpassage. Kortere citaten zijn niet controleerbaar. */
export const MIN_SOURCE_QUOTE_CHARS = 12;

/** Maximum aantal bevindingen dat we van één controle overnemen. */
export const MAX_FINDINGS = 40;

/**
 * Na deze tijd beschouwen we een controle die nog op 'processing' staat als
 * vastgelopen (proces gecrasht), zodat een nieuwe controle gestart kan worden.
 */
export const STALE_CHECK_AFTER_MS = 10 * 60 * 1000;

/**
 * Bovengrens voor een aantal in één unit. Getallen daarboven zijn vrijwel altijd
 * een maat of een prijs die per ongeluk als aantal gelezen wordt ("Tafel 2400").
 */
export const MAX_PLAUSIBLE_COUNT = 200;
