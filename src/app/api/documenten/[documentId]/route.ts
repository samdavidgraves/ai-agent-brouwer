import type { NextRequest } from "next/server";

import { DOCUMENT_BUCKET } from "@/lib/documents";
import { getSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Opent een document. De bucket is privaat, dus de server maakt een kortlopende
 * signed URL aan en stuurt de browser daarheen.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/documenten/[documentId]">,
) {
  const { documentId } = await context.params;

  if (!isUuid(documentId)) {
    return Response.json({ error: "Ongeldig document." }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase is nog niet geconfigureerd." },
      { status: 503 },
    );
  }

  const { data: document, error } = await supabase
    .from("project_documents")
    .select("file_name, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!document) return Response.json({ error: "Document niet gevonden." }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: document.file_name,
    });

  if (signError || !signed) {
    return Response.json(
      { error: signError?.message ?? "Kon het document niet openen." },
      { status: 500 },
    );
  }

  return Response.redirect(signed.signedUrl, 307);
}
