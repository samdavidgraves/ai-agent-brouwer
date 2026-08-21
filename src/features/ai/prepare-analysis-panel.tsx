"use client";

import { useActionState } from "react";

import { prepareAnalysisAction } from "@/features/ai/actions";
import { emptyPrepareState } from "@/features/ai/prepare-state";

/**
 * Stap vóór de controle: laat zien welke tekst uit de PDF's is gehaald en wat er
 * precies naar de analyse zou gaan. Roept geen enkele provider aan.
 */
export function PrepareAnalysisPanel({
  projectId,
  hasPdf,
}: {
  projectId: string;
  hasPdf: boolean;
}) {
  const [state, formAction, pending] = useActionState(prepareAnalysisAction, emptyPrepareState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        <button className="button-secondary" type="submit" disabled={pending || !hasPdf}>
          {pending ? "Bezig met voorbereiden…" : "Analyse voorbereiden"}
        </button>
        <span className="text-sm text-slate-500">
          Leest de PDF&apos;s uit en toont wat er geanalyseerd zou worden.
        </span>
      </form>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      {state.overview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            Voorbereid: {state.overview.length}{" "}
            {state.overview.length === 1 ? "document" : "documenten"},{" "}
            {state.inputLength.toLocaleString("nl-NL")} tekens invoer
          </p>

          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {state.overview.map((document) => (
              <li key={document.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{document.fileName}</span>
                <span className="text-slate-500">
                  {document.articleCount !== undefined
                    ? `${document.articleCount} artikelen` +
                      (document.rowCount ? ` uit ${document.rowCount.toLocaleString("nl-NL")} regels` : "") +
                      (document.subprojectCount ? ` · ${document.subprojectCount} subprojecten` : "")
                    : `${document.pageCount} ${document.pageCount === 1 ? "pagina" : "pagina's"} · ${document.charCount.toLocaleString("nl-NL")} tekens`}
                </span>
                {!document.usable && (
                  <span className="font-medium text-amber-700">geen bruikbare tekst</span>
                )}
              </li>
            ))}
          </ul>

          {state.problems.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {state.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {state.inputPreview && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-cyan-800 hover:underline">
                Toon de opgebouwde controle-invoer
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                {state.inputPreview}
                {state.inputLength > state.inputPreview.length &&
                  `\n\n… nog ${(state.inputLength - state.inputPreview.length).toLocaleString("nl-NL")} tekens`}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
