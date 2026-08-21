import "server-only";

import { DOCUMENT_BUCKET } from "@/lib/documents";
import { requireSupabaseClient } from "@/lib/supabase/server";
import type { DocumentRole } from "@/types/database";
import type { DocumentSource, SourceDocument, SourceResult } from "./types";

/**
 * De huidige bron: documenten die de werkvoorbereider zelf heeft geüpload.
 *
 * Bootst de uitkomst na van de echte workflow, waarin verkoop een project aanmaakt
 * en de generator tekeningen en stuklijst produceert. Zodra er een koppeling met
 * het intranet komt, komt daar een tweede implementatie van DocumentSource naast.
 */
export class SupabaseDocumentSource implements DocumentSource {
  readonly id = "supabase";
  readonly label = "Handmatige upload";

  async loadProject(projectId: string): Promise<SourceResult> {
    const supabase = requireSupabaseClient();

    const { data: project, error } = await supabase
      .from("projects")
      .select(
        "id, project_number, name, description, unit_type, quantity, status, project_documents(*)",
      )
      .eq("id", projectId)
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (!project) return { ok: false, message: "Project niet gevonden." };

    const rows = project.project_documents as {
      id: string;
      file_name: string;
      file_type: string;
      storage_path: string;
      document_role: DocumentRole;
    }[];

    const documents: SourceDocument[] = rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      fileType: row.file_type,
      role: row.document_role ?? "unknown",
      async read() {
        const download = await supabase.storage.from(DOCUMENT_BUCKET).download(row.storage_path);
        if (download.error || !download.data) {
          throw new Error(download.error?.message ?? "Bestand niet gevonden in storage.");
        }
        return new Uint8Array(await download.data.arrayBuffer());
      },
    }));

    return {
      ok: true,
      project: {
        id: project.id as string,
        project_number: project.project_number as string,
        name: project.name as string,
        description: project.description as string | null,
        unit_type: project.unit_type as string | null,
        quantity: project.quantity as number,
        status: project.status as string,
      },
      documents,
    };
  }
}
