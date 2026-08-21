import "server-only";

import { MAX_EXTRACTED_CHARS } from "@/features/ai/limits";
import { findParser, type ParsedDocument } from "@/features/documents/parsers";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { requireSupabaseClient } from "@/lib/supabase/server";
import type { DocumentRole } from "@/types/database";

/**
 * Leest een document uit storage met de parser die bij het bestandstype hoort en
 * legt het resultaat vast in `document_contents`.
 *
 * Wordt gebruikt direct na upload, zodat de werkvoorbereider meteen ziet of een
 * bestand leesbaar is. De controle gebruikt dezelfde parsers via prepare-analysis.
 *
 * Gooit nooit: fouten worden op de rij vastgelegd en teruggegeven.
 */
export async function extractDocumentContent(
  documentId: string,
  storagePath: string,
  fileName: string,
  fileType: string,
  role: DocumentRole = "unknown",
): Promise<{ ok: true; document: ParsedDocument } | { ok: false; message: string }> {
  const supabase = requireSupabaseClient();

  const parser = findParser(fileType);
  if (!parser) {
    return { ok: false, message: `Geen parser beschikbaar voor bestandstype ${fileType}.` };
  }

  await supabase.from("document_contents").upsert(
    { document_id: documentId, extraction_status: "processing", extraction_error: null },
    { onConflict: "document_id" },
  );

  try {
    const download = await supabase.storage.from(DOCUMENT_BUCKET).download(storagePath);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "Bestand niet gevonden in storage.");
    }

    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const parsed = await parser.parse(bytes, { fileName, role, maxChars: MAX_EXTRACTED_CHARS });

    if (!parsed.ok) throw new Error(parsed.message);

    await storeParsedContent(documentId, parsed.document);
    return { ok: true, document: parsed.document };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout bij het uitlezen.";

    await supabase.from("document_contents").upsert(
      { document_id: documentId, extraction_status: "failed", extraction_error: message },
      { onConflict: "document_id" },
    );

    return { ok: false, message };
  }
}

/**
 * Slaat de uitgelezen inhoud op. Valt terug op een kleinere set kolommen zolang
 * migratie 0004 nog niet is uitgevoerd, zodat de applicatie blijft werken.
 */
export async function storeParsedContent(
  documentId: string,
  parsed: ParsedDocument,
): Promise<void> {
  const supabase = requireSupabaseClient();

  const base = {
    document_id: documentId,
    extracted_text: parsed.pages.join("\n\n"),
    extraction_status: "completed",
    extraction_error: null,
    page_count: parsed.meta.pageCount,
    truncated: parsed.meta.truncated,
  };

  const { error } = await supabase.from("document_contents").upsert(
    {
      ...base,
      row_count: parsed.meta.rowCount ?? null,
      subproject_count: parsed.subprojects?.length ?? null,
    },
    { onConflict: "document_id" },
  );

  if (error) {
    await supabase.from("document_contents").upsert(base, { onConflict: "document_id" });
  }
}
