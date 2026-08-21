"use server";

import { revalidatePath } from "next/cache";

import { DOCUMENT_BUCKET } from "@/lib/documents";
import { requireSupabaseClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { DOCUMENT_ROLES, type DocumentRole } from "@/types/database";

export async function deleteDocument(formData: FormData): Promise<void> {
  const documentId = String(formData.get("document_id") ?? "").trim();
  if (!isUuid(documentId)) throw new Error("Ongeldig document.");

  const supabase = requireSupabaseClient();

  const { data: document, error: lookupError } = await supabase
    .from("project_documents")
    .select("id, project_id, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (!document) throw new Error("Document niet gevonden.");

  // Eerst het bestand, dan de rij. Andersom zou een mislukte storage-verwijdering
  // een bestand achterlaten waar niets meer naar verwijst.
  const { error: storageError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .remove([document.storage_path]);

  if (storageError) throw new Error(storageError.message);

  const { error: deleteError } = await supabase
    .from("project_documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) throw new Error(deleteError.message);

  revalidatePath(`/projecten/${document.project_id}`);
}

/**
 * De werkvoorbereider geeft zelf aan wat een document is. Zonder rol doet een
 * document niet mee aan de vergelijkende controles.
 */
export async function updateDocumentRole(formData: FormData): Promise<void> {
  const documentId = String(formData.get("document_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const role = String(formData.get("document_role") ?? "").trim();

  if (!isUuid(documentId) || !isUuid(projectId)) throw new Error("Ongeldig document.");
  if (!DOCUMENT_ROLES.includes(role as DocumentRole)) {
    throw new Error(`Onbekende documentrol: ${role}`);
  }

  const supabase = requireSupabaseClient();
  const { error } = await supabase
    .from("project_documents")
    .update({ document_role: role })
    .eq("id", documentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/projecten/${projectId}`);
}
