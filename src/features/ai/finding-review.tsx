"use client";

import { useFormStatus } from "react-dom";

import { updateFindingStatus } from "@/features/ai/actions";
import type { FindingStatus } from "@/types/database";

const CHOICES: { status: FindingStatus; label: string }[] = [
  { status: "accepted", label: "Terecht" },
  { status: "rejected", label: "Onterecht" },
  { status: "needs_review", label: "Nader controleren" },
];

export function FindingReview({
  findingId,
  projectId,
  current,
}: {
  findingId: string;
  projectId: string;
  current: FindingStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Beoordeling
      </span>
      {CHOICES.map((choice) => (
        <form action={updateFindingStatus} key={choice.status}>
          <input type="hidden" name="finding_id" value={findingId} />
          <input type="hidden" name="project_id" value={projectId} />
          <input
            type="hidden"
            name="status"
            value={current === choice.status ? "open" : choice.status}
          />
          <ChoiceButton label={choice.label} active={current === choice.status} />
        </form>
      ))}
    </div>
  );
}

function ChoiceButton({ label, active }: { label: string; active: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {pending ? "…" : label}
    </button>
  );
}
