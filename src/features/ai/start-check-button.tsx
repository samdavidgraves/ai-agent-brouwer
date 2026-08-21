"use client";

import { useActionState } from "react";

import { startAiCheck, type AiCheckState } from "@/features/ai/actions";

const initialState: AiCheckState = { error: null, message: null };

export function StartCheckButton({
  projectId,
  hasPdf,
  isRunning,
  hasEarlierCheck,
  providerLabel,
  usesPaidApi,
}: {
  projectId: string;
  hasPdf: boolean;
  isRunning: boolean;
  hasEarlierCheck: boolean;
  providerLabel: string;
  usesPaidApi: boolean;
}) {
  const [state, formAction, pending] = useActionState(startAiCheck, initialState);
  const disabled = pending || !hasPdf || isRunning;

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        <button className="button-primary" type="submit" disabled={disabled}>
          {pending
            ? "Controle bezig…"
            : hasEarlierCheck
              ? "Controle opnieuw uitvoeren"
              : "Start controle"}
        </button>

        <span className="text-sm text-slate-500">
          via {providerLabel}
          {!usesPaidApi && " · geen kosten"}
        </span>

        {pending && (
          <span className="flex items-center gap-2 text-sm text-slate-600" role="status">
            <span
              aria-hidden
              className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
            />
            De documenten worden gelezen en beoordeeld. Laat deze pagina open staan.
          </span>
        )}
      </form>

      {!hasPdf && (
        <p className="text-sm text-slate-500">
          Voeg eerst een PDF toe. Deze versie leest alleen PDF-documenten; Excel, Word en
          tekeningen volgen later.
        </p>
      )}

      {isRunning && !pending && (
        <p className="text-sm text-slate-600">
          Er loopt al een controle voor dit project.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      {state.message && !state.error && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {state.message}
        </p>
      )}
    </div>
  );
}
