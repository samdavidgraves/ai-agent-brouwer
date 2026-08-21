import type { DocumentRole } from "@/types/database";

/** Eén document zoals een bron het aanlevert, los van waar het vandaan komt. */
export type SourceDocument = {
  id: string;
  fileName: string;
  /** Extensie zonder punt, in kleine letters. */
  fileType: string;
  role: DocumentRole;
  /** Haalt de inhoud op. Pas aanroepen wanneer het document echt gelezen wordt. */
  read(): Promise<Uint8Array>;
};

export type SourceProject = {
  id: string;
  project_number: string;
  name: string;
  description: string | null;
  unit_type: string | null;
  quantity: number;
  status: string;
};

export type SourceResult =
  | { ok: true; project: SourceProject; documents: SourceDocument[] }
  | { ok: false; message: string };

/**
 * Waar de documenten van een project vandaan komen.
 *
 * Vandaag: handmatige upload naar Supabase Storage (SupabaseDocumentSource).
 * Later: ophalen uit het Brouwer-intranet op projectnummer, met dezelfde vorm.
 *
 * De analyse-engine kent alleen deze interface. Een nieuwe bron toevoegen vraagt
 * daarom geen wijziging in parsers, controles of bronverificatie.
 */
export interface DocumentSource {
  readonly id: string;
  /** Naam voor in de interface, bijvoorbeeld "Handmatige upload". */
  readonly label: string;
  loadProject(projectId: string): Promise<SourceResult>;
}
