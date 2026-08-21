import { FindingReview } from "@/features/ai/finding-review";
import {
  AI_CHECK_STATUS_LABELS,
  CATEGORY_LABELS,
  CHECK_AREA_LABELS,
  CHECK_AREA_ORDER,
  CONFIDENCE_LABELS,
  FINDING_STATUS_LABELS,
  FINDING_STATUS_STYLES,
  FINDING_TYPE_CARD,
  FINDING_TYPE_DOT,
  FINDING_TYPE_EXPLANATION,
  FINDING_TYPE_LABELS,
  FINDING_TYPE_PLURAL,
} from "@/features/ai/labels";
import { PrepareAnalysisPanel } from "@/features/ai/prepare-analysis-panel";
import { ACTIVE_PROFILE } from "@/features/ai/prompts";
import { describeActiveProvider } from "@/features/ai/providers";
import { StartCheckButton } from "@/features/ai/start-check-button";
import { updateProjectStatus } from "@/features/projects/actions";
import { formatDateTime, isAnalyzableFileType } from "@/lib/documents";
import {
  FINDING_TYPES,
  type AiCheckWithFindings,
  type Project,
  type ProjectDocument,
} from "@/types/database";

/** De vijf controles die het profiel uitvoert, in vaste volgorde. */
const PROFILE_CHECKS = CHECK_AREA_ORDER.filter((area) => area !== "general");

export function AiCheckPanel({
  project,
  documents,
  check,
  schemaReady,
  rolesReady,
}: {
  project: Project;
  documents: ProjectDocument[];
  check: AiCheckWithFindings | null;
  schemaReady: boolean;
  /** false wanneer migratie 0003 nog niet is uitgevoerd. */
  rolesReady: boolean;
}) {
  const analyzable = documents.filter((document) => isAnalyzableFileType(document.file_type));
  const unsupported = documents.length - analyzable.length;
  const isRunning = check?.status === "processing" || check?.status === "pending";
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const provider = describeActiveProvider();

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-slate-950">{ACTIVE_PROFILE.label}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Profielversie {ACTIVE_PROFILE.version}</p>
        </div>
        {check && (
          <span className="text-sm text-slate-500">
            Status: {AI_CHECK_STATUS_LABELS[check.status]}
            {check.completed_at && ` · ${formatDateTime(check.completed_at)}`}
          </span>
        )}
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-500">Documenten gecontroleerd:</dt>
              <dd className="font-semibold tabular-nums text-slate-950">{analyzable.length}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Documenten niet ondersteund:</dt>
              <dd className="font-semibold tabular-nums text-slate-950">{unsupported}</dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Controles
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              {PROFILE_CHECKS.map((area) => (
                <li key={area}>{CHECK_AREA_LABELS[area]}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          De controle vergelijkt de aangeleverde documenten met elkaar en signaleert
          punten om na te kijken. Er wordt nooit aangenomen wat een correcte uitvoering
          hoort te zijn — alleen wat aantoonbaar in de documenten staat of daarin
          ontbreekt. Jij beoordeelt elke constatering.
        </p>

        {!provider.usesPaidApi && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold">Testprovider actief.</span> Er wordt geen externe
            AI-dienst aangeroepen en er zijn geen API-kosten. De constateringen komen uit
            eenvoudige patroonherkenning op de documenttekst, niet uit een taalmodel; ze
            missen dus veel wat een echte analyse wel zou zien. De rest van de keten —
            uitlezen, bronverificatie, opslaan en beoordelen — werkt wel echt.
          </p>
        )}

        {!rolesReady && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Migratie 0003 is nog niet uitgevoerd</p>
            <p className="mt-1">
              Voer <code className="font-mono">supabase/migrations/0003_brouwer_check_profile.sql</code>{" "}
              uit in de Supabase SQL Editor. Zonder documentrollen kan de controle niet weten
              wat ze met wat moet vergelijken, en zijn de vijf controles niet beschikbaar.
            </p>
          </div>
        )}

        {schemaReady ? (
          <div className="space-y-5">
            <PrepareAnalysisPanel projectId={project.id} hasPdf={analyzable.length > 0} />
            <StartCheckButton
              projectId={project.id}
              hasPdf={analyzable.length > 0}
              isRunning={isRunning}
              hasEarlierCheck={Boolean(check)}
              providerLabel={provider.label}
              usesPaidApi={provider.usesPaidApi}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">De controletabellen ontbreken nog</p>
            <p className="mt-1">
              Voer de migraties in <code className="font-mono">supabase/migrations/</code> uit
              in de Supabase SQL Editor. Daarna kan de controle gestart worden.
            </p>
          </div>
        )}

        {check?.status === "failed" && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">De vorige controle is mislukt</p>
            <p className="mt-1">{check.error ?? "Geen foutmelding vastgelegd."}</p>
          </div>
        )}

        {check?.status === "completed" && (
          <CheckResults check={check} documentsById={documentsById} projectId={project.id} />
        )}

        <form action={updateProjectStatus} className="border-t border-slate-100 pt-4">
          <input type="hidden" name="project_id" value={project.id} />
          <input
            type="hidden"
            name="status"
            value={project.status === "draft" ? "ready_for_check" : "draft"}
          />
          <button
            className="button-secondary"
            type="submit"
            disabled={project.status === "draft" && documents.length === 0}
          >
            {project.status === "draft"
              ? "Markeren als gereed voor controle"
              : "Terugzetten naar concept"}
          </button>
        </form>
      </div>
    </section>
  );
}

function CheckResults({
  check,
  documentsById,
  projectId,
}: {
  check: AiCheckWithFindings;
  documentsById: Map<string, ProjectDocument>;
  projectId: string;
}) {
  const findings = check.ai_findings;
  const counts = FINDING_TYPES.map((type) => ({
    type,
    count: findings.filter((finding) => finding.finding_type === type).length,
  }));
  const reviewed = findings.filter((finding) => finding.status !== "open").length;

  return (
    <div className="space-y-5 border-t border-slate-100 pt-5">
      <div>
        <h3 className="font-semibold text-slate-950">Samenvatting</h3>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {counts.map(({ type, count }) => (
            <li
              key={type}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span
                aria-hidden
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${FINDING_TYPE_DOT[type]}`}
              />
              <span className="font-semibold tabular-nums text-slate-950">{count}</span>
              <span className="text-slate-600">{FINDING_TYPE_PLURAL[type]}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="text-slate-600">
              {findings.length === 0 ? "Geen afwijking gevonden" : "Zie constateringen"}
            </span>
          </li>
        </ul>

        {findings.length === 0 && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            De controle vond niets dat met een letterlijke passage te onderbouwen was. Dat is
            geen garantie dat het dossier klopt — het betekent dat er niets is aangetoond.
          </p>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Model: {check.model ?? "onbekend"} · Profiel:{" "}
          {check.profile_label ?? check.prompt_version ?? "onbekend"} (
          {check.prompt_version ?? "?"})
          {check.duration_ms !== null && ` · ${(check.duration_ms / 1000).toFixed(1)}s`}
          {check.findings_rejected > 0 &&
            ` · ${check.findings_rejected} verworpen wegens oncontroleerbare bron`}
          {findings.length > 0 && ` · ${reviewed} van ${findings.length} beoordeeld`}
        </p>
      </div>

      {findings.length > 0 && (
        <ul className="space-y-4">
          {findings.map((finding) => {
            const document = documentsById.get(finding.source_document_id);
            const compared = finding.compared_document_id
              ? documentsById.get(finding.compared_document_id)
              : undefined;

            return (
              <li
                key={finding.id}
                className={`rounded-xl border px-5 py-4 ${FINDING_TYPE_CARD[finding.finding_type]}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${FINDING_TYPE_DOT[finding.finding_type]}`}
                  />
                  <span className="text-sm font-semibold text-slate-950">
                    {FINDING_TYPE_LABELS[finding.finding_type]}
                  </span>
                  <Chip>{CHECK_AREA_LABELS[finding.check_area]}</Chip>
                  <Chip>{CATEGORY_LABELS[finding.category]}</Chip>
                  <Chip>{CONFIDENCE_LABELS[finding.confidence]}</Chip>
                  <span
                    className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${FINDING_STATUS_STYLES[finding.status]}`}
                  >
                    {FINDING_STATUS_LABELS[finding.status]}
                  </span>
                </div>

                <h4 className="mt-3 font-semibold text-slate-950">{finding.title}</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  {finding.description}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {FINDING_TYPE_EXPLANATION[finding.finding_type]}
                </p>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Bron
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {document ? (
                      <a
                        className="font-medium text-cyan-800 hover:underline"
                        href={`/api/documenten/${document.id}`}
                      >
                        {document.file_name}
                      </a>
                    ) : (
                      <span className="text-slate-500">Document niet meer beschikbaar</span>
                    )}
                    {" · "}
                    {finding.source_reference}
                  </p>
                  <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600">
                    “{finding.source_quote}”
                  </blockquote>

                  {compared && finding.compared_quote && (
                    <>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Vergeleken met
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        <a
                          className="font-medium text-cyan-800 hover:underline"
                          href={`/api/documenten/${compared.id}`}
                        >
                          {compared.file_name}
                        </a>
                        {finding.compared_reference ? ` · ${finding.compared_reference}` : ""}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600">
                        “{finding.compared_quote}”
                      </blockquote>
                    </>
                  )}
                </div>

                <div className="mt-3">
                  <FindingReview
                    findingId={finding.id}
                    projectId={projectId}
                    current={finding.status}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      {children}
    </span>
  );
}
