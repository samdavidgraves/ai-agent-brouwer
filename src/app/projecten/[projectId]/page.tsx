import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectStatusBadge } from "@/components/project-status-badge";
import { SupabaseNotice } from "@/components/supabase-notice";
import { AiCheckPanel } from "@/features/ai/ai-check-panel";
import { getLatestAiCheck } from "@/features/ai/queries";
import { DeleteDocumentButton } from "@/features/documents/delete-document-button";
import { DocumentRoleSelect } from "@/features/documents/document-role-select";
import { DocumentUpload } from "@/features/documents/document-upload";
import {
  getDocumentRoles,
  getExtractionSummaries,
  type ExtractionSummary,
} from "@/features/documents/queries";
import { getProject } from "@/features/projects/queries";
import {
  describeUnsupportedReason,
  formatDateTime,
  formatFileSize,
  isAnalyzableFileType,
} from "@/lib/documents";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/projecten/[projectId]">) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    // Zonder Supabase-configuratie is elk project onvindbaar; toon dan de uitleg
    // in plaats van een misleidende 404.
    if (!isSupabaseConfigured()) {
      return (
        <main className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-8">
          <SupabaseNotice />
        </main>
      );
    }
    notFound();
  }

  const documents = project.project_documents;
  const documentIds = documents.map((document) => document.id);
  const [aiCheckResult, extractions, roles] = await Promise.all([
    getLatestAiCheck(project.id),
    getExtractionSummaries(documentIds),
    getDocumentRoles(documentIds),
  ]);
  // roles === null betekent: migratie 0003 is nog niet uitgevoerd.
  const rolesReady = roles !== null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-8">
      <Link className="text-sm font-medium text-cyan-700 hover:text-cyan-800" href="/">
        ← Terug naar projecten
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-500">
            {project.project_number}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            {project.name}
          </h1>
        </div>
        <ProjectStatusBadge status={project.status} />
      </header>

      <div className="mt-8 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-950">Projectinformatie</h2>
          </div>
          <dl className="grid gap-x-8 gap-y-5 px-6 py-5 sm:grid-cols-2">
            <Detail label="Projectnummer" value={project.project_number} mono />
            <Detail label="Projectnaam" value={project.name} />
            <Detail label="Type unit" value={project.unit_type} />
            <Detail label="Aantal units" value={String(project.quantity)} />
            <Detail label="Aangemaakt" value={formatDateTime(project.created_at)} />
            <Detail label="Laatst gewijzigd" value={formatDateTime(project.updated_at)} />
            <div className="sm:col-span-2">
              <Detail label="Omschrijving" value={project.description} />
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-950">Documenten</h2>
            <span className="text-sm text-slate-500">
              {documents.length} {documents.length === 1 ? "document" : "documenten"}
            </span>
          </div>

          <div className="px-6 py-5">
            <DocumentUpload projectId={project.id} />
          </div>

          {documents.length === 0 ? (
            <p className="border-t border-slate-100 px-6 py-8 text-center text-sm text-slate-500">
              Nog geen documenten gekoppeld aan dit project.
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Bestandsnaam</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Rol</th>
                    <th scope="col" className="px-6 py-3 text-right font-semibold">Grootte</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Geüpload</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Tekst uitgelezen</th>
                    <th scope="col" className="px-6 py-3">
                      <span className="sr-only">Acties</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td className="px-6 py-4">
                        <a
                          className="font-medium text-cyan-800 hover:underline"
                          href={`/api/documenten/${document.id}`}
                        >
                          {document.file_name}
                        </a>
                      </td>
                      <td className="px-6 py-4 uppercase text-slate-600">
                        {document.file_type}
                      </td>
                      <td className="px-6 py-4">
                        {rolesReady ? (
                          <DocumentRoleSelect
                            documentId={document.id}
                            projectId={project.id}
                            role={roles.get(document.id) ?? "unknown"}
                          />
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums whitespace-nowrap text-slate-600">
                        {formatFileSize(document.file_size)}
                      </td>
                      <td className="px-6 py-4 tabular-nums whitespace-nowrap text-slate-500">
                        {formatDateTime(document.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <ExtractionCell
                          fileType={document.file_type}
                          summary={extractions.get(document.id)}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DeleteDocumentButton
                          documentId={document.id}
                          fileName={document.file_name}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <AiCheckPanel
          project={project}
          documents={documents}
          check={aiCheckResult.check}
          schemaReady={aiCheckResult.schemaReady}
          rolesReady={rolesReady}
        />
      </div>
    </main>
  );
}

/** Laat zien of de PDF-tekst bruikbaar is voor de AI-controle. */
function ExtractionCell({
  fileType,
  summary,
}: {
  fileType: string;
  summary: ExtractionSummary | undefined;
}) {
  // Inventor, Revit, Excel, Word en afbeeldingen worden bewaard maar niet gelezen.
  // Dat moet zichtbaar zijn, zodat niemand denkt dat ze zijn meegenomen.
  if (!isAnalyzableFileType(fileType)) {
    return (
      <span className="text-sm text-slate-500" title={describeUnsupportedReason(fileType)}>
        Opgeslagen, analyse niet ondersteund
      </span>
    );
  }

  if (!summary || summary.extraction_status === "pending") {
    return <span className="text-sm text-slate-500">In wachtrij</span>;
  }

  if (summary.extraction_status === "processing") {
    return <span className="text-sm text-slate-500">Bezig…</span>;
  }

  if (summary.extraction_status === "failed") {
    return (
      <span className="text-sm font-medium text-red-700" title={summary.extraction_error ?? ""}>
        Mislukt
      </span>
    );
  }

  return (
    <span className="text-sm text-slate-600">
      {summary.page_count
        ? `${summary.page_count} ${summary.page_count === 1 ? "pagina" : "pagina's"}`
        : "Gereed"}
      {summary.truncated && <span className="text-amber-700"> · afgekapt</span>}
    </span>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 whitespace-pre-line text-slate-950 ${mono ? "font-mono" : ""} ${value ? "" : "text-slate-400"}`}
      >
        {value || "Niet ingevuld"}
      </dd>
    </div>
  );
}
