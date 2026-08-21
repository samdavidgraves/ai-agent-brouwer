import { z } from "zod";

import {
  CHECK_AREAS,
  CONFIDENCE_LEVELS,
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_TYPES,
} from "@/types/database";

/**
 * Vorm waarin een provider zijn antwoord moet geven.
 *
 * Documenten worden aangeduid met een 1-gebaseerd indexnummer, niet met een UUID:
 * taalmodellen reproduceren UUID's onbetrouwbaar, indexnummers vrijwel altijd
 * correct. De server zet het nummer daarna terug om naar het echte document.
 *
 * Alle velden zijn verplicht en nergens staat `.optional()`. OpenAI's strict mode
 * eist dat; voor "geen waarde" gebruiken we expliciet `null`.
 */
export const aiFindingSchema = z.object({
  finding_type: z.enum(FINDING_TYPES),
  check_area: z.enum(CHECK_AREAS),
  severity: z.enum(FINDING_SEVERITIES),
  category: z.enum(FINDING_CATEGORIES),
  title: z.string(),
  description: z.string(),
  source_document_index: z.number().int(),
  source_page: z.number().int().nullable(),
  source_quote: z.string(),
  /** Het tweede document bij een vergelijking, of null. */
  compared_document_index: z.number().int().nullable(),
  /** Paginanummer in het tweede document, of null. */
  compared_page: z.number().int().nullable(),
  /** Letterlijke passage uit het tweede document, of leeg wanneer die er niet is. */
  compared_quote: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export const aiResponseSchema = z.object({
  findings: z.array(aiFindingSchema),
});

export type RawAiFinding = z.infer<typeof aiFindingSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;

/**
 * Valideert een reeds geparseerd antwoord van een provider.
 * Gebruikt door de orchestratie én door de tests.
 */
export function parseAiResponse(
  value: unknown,
): { ok: true; response: AiResponse } | { ok: false; message: string } {
  const result = aiResponseSchema.safeParse(value);
  if (result.success) return { ok: true, response: result.data };

  const issue = result.error.issues[0];
  const path = issue?.path.join(".") || "antwoord";
  return {
    ok: false,
    message: `Het antwoord had niet de verwachte vorm (${path}: ${issue?.message ?? "onbekende fout"}).`,
  };
}
