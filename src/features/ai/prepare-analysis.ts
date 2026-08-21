import "server-only";

import {
  buildAnalysisInput,
  hasUsableText,
  orderByRole,
  type ProjectSummary,
} from "@/features/ai/build-input";
import { MAX_EXTRACTED_CHARS } from "@/features/ai/limits";
import type { AnalysisDocument } from "@/features/ai/verify-findings";
import { storeParsedContent } from "@/features/documents/extract-content";
import { findParser } from "@/features/documents/parsers";
import { SupabaseDocumentSource } from "@/features/documents/sources/supabase-source";
import type { DocumentSource } from "@/features/documents/sources/types";
import { describeUnsupportedReason, isAnalyzableFileType } from "@/lib/documents";
import { requireSupabaseClient } from "@/lib/supabase/server";
import type { DocumentRole, ProjectStatus } from "@/types/database";

export type PreparedDocument = {
  id: string;
  fileName: string;
  role: DocumentRole;
  pageCount: number;
  charCount: number;
  usable: boolean;
  /** Alleen voor stuklijsten. */
  articleCount?: number;
  subprojectCount?: number;
  rowCount?: number;
};

export type UnsupportedDocument = {
  id: string;
  fileName: string;
  fileType: string;
  reason: string;
};

export type PreparedAnalysis = {
  project: ProjectSummary & { id: string; status: ProjectStatus };
  documents: AnalysisDocument[];
  overview: PreparedDocument[];
  unsupported: UnsupportedDocument[];
  input: string;
  problems: string[];
  sourceId: string;
};

export type PrepareResult =
  | { ok: true; prepared: PreparedAnalysis }
  | { ok: false; message: string };

/** Standaardbron: handmatige upload. Later te vervangen door een intranetbron. */
export const defaultDocumentSource: DocumentSource = new SupabaseDocumentSource();

/**
 * Leest de documenten van een project, ontleedt ze met de passende parser en bouwt
 * de controle-invoer op. Roept geen enkele externe API aan.
 *
 * De bron is een parameter. Daardoor werkt dezelfde voorbereiding straks op
 * bestanden die uit het Brouwer-intranet komen, zonder wijziging in de parsers,
 * de controles of de bronverificatie.
 */
export async function prepareAnalysis(
  projectId: string,
  source: DocumentSource = defaultDocumentSource,
): Promise<PrepareResult> {
  const loaded = await source.loadProject(projectId);
  if (!loaded.ok) return { ok: false, message: loaded.message };

  const { project, documents: sourceDocuments } = loaded;
  const supabase = requireSupabaseClient();

  const unsupported: UnsupportedDocument[] = sourceDocuments
    .filter((document) => !isAnalyzableFileType(document.fileType))
    .map((document) => ({
      id: document.id,
      fileName: document.fileName,
      fileType: document.fileType,
      reason: describeUnsupportedReason(document.fileType),
    }));

  const candidates = sourceDocuments.filter((document) => isAnalyzableFileType(document.fileType));

  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        unsupported.length > 0
          ? "Dit project bevat alleen documenttypen die nog niet worden geanalyseerd. Voeg een offerte of tekening als PDF toe, of een stuklijst als xlsx."
          : "Dit project bevat nog geen analyseerbaar document. Ondersteund: PDF (offerte, tekening) en xlsx (stuklijst).",
    };
  }

  const documents: AnalysisDocument[] = [];
  const overview: PreparedDocument[] = [];
  const problems: string[] = [];

  for (const document of candidates) {
    const parser = findParser(document.fileType);
    if (!parser) {
      problems.push(`${document.fileName}: geen parser beschikbaar voor ${document.fileType}.`);
      continue;
    }

    let parsed;
    try {
      const bytes = await document.read();
      parsed = await parser.parse(bytes, {
        fileName: document.fileName,
        role: document.role,
        maxChars: MAX_EXTRACTED_CHARS,
      });
    } catch (error) {
      problems.push(
        `${document.fileName}: ${error instanceof Error ? error.message : "kon niet worden gelezen"}.`,
      );
      continue;
    }

    if (!parsed.ok) {
      problems.push(`${document.fileName}: ${parsed.message}`);
      await supabase.from("document_contents").upsert(
        {
          document_id: document.id,
          extraction_status: "failed",
          extraction_error: parsed.message,
        },
        { onConflict: "document_id" },
      );
      continue;
    }

    const analysisDocument: AnalysisDocument = {
      id: document.id,
      fileName: document.fileName,
      role: document.role,
      pages: parsed.document.pages,
      articles: parsed.document.articles,
      subprojectCount: parsed.document.subprojects?.length,
    };

    const usable = hasUsableText(analysisDocument);
    if (!usable) {
      problems.push(
        `${document.fileName}: geen bruikbare inhoud gevonden, vermoedelijk een scan of een lege export.`,
      );
    }

    await storeParsedContent(document.id, parsed.document);

    documents.push(analysisDocument);
    overview.push({
      id: document.id,
      fileName: document.fileName,
      role: document.role,
      pageCount: parsed.document.meta.pageCount,
      charCount: analysisDocument.pages.join(" ").length,
      usable,
      articleCount: parsed.document.articles?.length,
      subprojectCount: parsed.document.subprojects?.length,
      rowCount: parsed.document.meta.rowCount,
    });
  }

  // Sorteren op rol: offerte, tekening, stuklijst. De nummering die een provider
  // ziet volgt deze volgorde, dus die moet vastliggen voordat de invoer wordt
  // opgebouwd en voordat bevindingen aan documenten worden gekoppeld.
  const readable = orderByRole(documents.filter(hasUsableText));

  if (readable.length === 0) {
    const detail = problems.length
      ? ` ${problems.join(" ")}`
      : " De documenten bevatten geen uitleesbare inhoud.";
    return { ok: false, message: `Geen enkel document leverde bruikbare inhoud op.${detail}` };
  }

  return {
    ok: true,
    prepared: {
      project: {
        id: project.id,
        status: project.status as ProjectStatus,
        project_number: project.project_number,
        name: project.name,
        description: project.description,
        unit_type: project.unit_type,
        quantity: project.quantity,
      },
      documents: readable,
      overview,
      unsupported,
      input: buildAnalysisInput(project as ProjectSummary, readable),
      problems,
      sourceId: source.id,
    },
  };
}
