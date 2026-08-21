import Link from "next/link";

import { ProjectStatusBadge } from "@/components/project-status-badge";
import { SupabaseNotice } from "@/components/supabase-notice";
import { getProjects } from "@/features/projects/queries";
import { formatDate } from "@/lib/documents";

// De projectlijst komt live uit Supabase en mag niet op buildtijd worden bevroren.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-8">
      <section className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-700">
            Werkvoorbereiding
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            AI Agent Brouwer
          </h1>
          <p className="mt-2 max-w-xl text-slate-600">
            Digitale tweede controle voor een zorgvuldige werkvoorbereiding.
          </p>
        </div>
        <Link className="button-primary" href="/projecten/nieuw">
          Nieuw project
        </Link>
      </section>

      <SupabaseNotice />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold text-slate-950">Projecten</h2>
          <span className="text-sm text-slate-500">
            {projects.length} {projects.length === 1 ? "project" : "projecten"}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium text-slate-800">Nog geen projecten</p>
            <p className="mt-1 text-sm text-slate-500">
              Maak een project aan om documenten te verzamelen voor de controle.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">Projectnummer</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Projectnaam</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Type unit</th>
                  <th scope="col" className="px-6 py-3 text-right font-semibold">Aantal</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Laatst gewijzigd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr key={project.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/projecten/${project.id}`}
                        className="font-mono font-semibold text-cyan-800 hover:underline"
                      >
                        {project.project_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-950">{project.name}</td>
                    <td className="px-6 py-4 text-slate-600">{project.unit_type ?? "—"}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-600">
                      {project.quantity}
                    </td>
                    <td className="px-6 py-4">
                      <ProjectStatusBadge status={project.status} />
                    </td>
                    <td className="px-6 py-4 tabular-nums whitespace-nowrap text-slate-500">
                      {formatDate(project.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
