import type { ProjectStatus } from "@/types/database";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Concept",
  ready_for_check: "Gereed voor controle",
  checking: "In controle",
  completed: "Afgerond",
};

const styles: Record<ProjectStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  ready_for_check: "bg-blue-50 text-blue-800 ring-blue-200",
  checking: "bg-amber-50 text-amber-800 ring-amber-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[status]}`}
    >
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
