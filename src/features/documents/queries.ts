import { isMissingColumnError, isMissingTableError } from "@/lib/supabase/errors";
import { getSupabaseClient } from "@/lib/supabase/server";
import type { DocumentContent, DocumentRole } from "@/types/database";

export type ExtractionSummary = Pick<
  DocumentContent,
  "extraction_status" | "extraction_error" | "page_count" | "truncated"
>;

/** Leesstatus per document, op document_id. Documenten zonder rij ontbreken in de map. */
export async function getExtractionSummaries(
  documentIds: string[],
): Promise<Map<string, ExtractionSummary>> {
  const summaries = new Map<string, ExtractionSummary>();
  if (documentIds.length === 0) return summaries;

  const supabase = getSupabaseClient();
  if (!supabase) return summaries;

  const { data, error } = await supabase
    .from("document_contents")
    .select("document_id, extraction_status, extraction_error, page_count, truncated")
    .in("document_id", documentIds);

  // Zonder de v0.2-tabellen tonen we simpelweg geen leesstatus.
  if (isMissingTableError(error)) return summaries;
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    summaries.set(row.document_id as string, {
      extraction_status: row.extraction_status,
      extraction_error: row.extraction_error,
      page_count: row.page_count,
      truncated: row.truncated,
    });
  }

  return summaries;
}

/**
 * Documentrollen per document. Geeft `null` terug wanneer migratie 0003 nog niet
 * is uitgevoerd, zodat de interface daar eerlijk over kan zijn in plaats van
 * iedereen "Offerte" te tonen.
 */
export async function getDocumentRoles(
  documentIds: string[],
): Promise<Map<string, DocumentRole> | null> {
  if (documentIds.length === 0) return new Map();

  const supabase = getSupabaseClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from("project_documents")
    .select("id, document_role")
    .in("id", documentIds);

  if (isMissingColumnError(error)) return null;
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.id as string, row.document_role as DocumentRole]));
}
