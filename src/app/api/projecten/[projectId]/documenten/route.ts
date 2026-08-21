import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { extractDocumentContent } from "@/features/documents/extract-content";
import {
  buildStoragePath,
  DOCUMENT_BUCKET,
  isAnalyzableFileType,
  validateUpload,
} from "@/lib/documents";
import { getSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/uuid";
import { DOCUMENT_ROLES, type DocumentRole } from "@/types/database";

/**
 * Upload van een projectdocument.
 *
 * Bewust een route handler en geen server action: server actions hebben een
 * standaard body-limiet van 1 MB, wat te krap is voor tekeningen en werkbladen.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/projecten/[projectId]/documenten">,
) {
  const { projectId } = await context.params;

  if (!isUuid(projectId)) {
    return Response.json({ error: "Ongeldig project." }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase is nog niet geconfigureerd." },
      { status: 503 },
    );
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    return Response.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return Response.json({ error: "Project niet gevonden." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }

  const requestedRole = String(formData.get("document_role") ?? "unknown");
  const documentRole: DocumentRole = DOCUMENT_ROLES.includes(requestedRole as DocumentRole)
    ? (requestedRole as DocumentRole)
    : "unknown";

  const validation = validateUpload(file.name, file.size);
  if (!validation.ok) {
    return Response.json({ error: validation.message }, { status: 400 });
  }

  const storagePath = buildStoragePath(projectId, file.name);

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      contentType: validation.contentType,
      upsert: false,
    });

  if (uploadError) {
    return Response.json(
      { error: `Uploaden mislukt: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const baseRow = {
    project_id: projectId,
    file_name: file.name,
    file_type: validation.extension,
    storage_path: storagePath,
    file_size: file.size,
  };

  let { data: document, error: insertError } = await supabase
    .from("project_documents")
    .insert({ ...baseRow, document_role: documentRole })
    .select("id")
    .single();

  // Zolang migratie 0003 nog niet is uitgevoerd bestaat de kolom document_role
  // niet. De upload zelf moet dan gewoon blijven werken.
  if (isMissingColumnError(insertError)) {
    ({ data: document, error: insertError } = await supabase
      .from("project_documents")
      .insert(baseRow)
      .select("id")
      .single());
  }

  if (insertError || !document) {
    // Het bestand staat al in storage maar heeft geen registratie meer; opruimen.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    return Response.json(
      { error: insertError?.message ?? "Document kon niet worden geregistreerd." },
      { status: 500 },
    );
  }

  // Inhoud meteen uitlezen met de parser die bij het bestandstype hoort, zodat de
  // werkvoorbereider direct ziet of het bestand leesbaar is. Mislukt dit, dan blijft
  // de upload gewoon geslaagd: de fout wordt vastgelegd op document_contents en de
  // controle probeert het later opnieuw. Niet-ondersteunde typen worden alleen
  // bewaard, niet gelezen.
  if (isAnalyzableFileType(validation.extension)) {
    await extractDocumentContent(
      document.id,
      storagePath,
      file.name,
      validation.extension,
      documentRole,
    );
  }

  revalidatePath(`/projecten/${projectId}`);
  return Response.json({ id: document.id }, { status: 201 });
}
