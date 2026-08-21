import Link from "next/link";

import { NewProjectForm } from "@/features/projects/new-project-form";

export default function NewProjectPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 lg:px-8">
      <Link className="text-sm font-medium text-cyan-700 hover:text-cyan-800" href="/">
        ← Terug naar projecten
      </Link>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-700">
          Nieuw project
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Projectgegevens
        </h1>
        <p className="mt-2 text-slate-600">
          Leg de basis vast voordat documenten worden toegevoegd.
        </p>

        <NewProjectForm />
      </div>
    </main>
  );
}
