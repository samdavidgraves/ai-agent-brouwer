"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createProject, type FormState } from "@/features/projects/actions";

const initialState: FormState = { error: null };

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, initialState);

  return (
    <form action={formAction} className="mt-8 grid gap-5">
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field-label">
          Projectnummer
          <input className="field-input" name="project_number" required maxLength={50} />
        </label>
        <label className="field-label">
          Projectnaam
          <input className="field-input" name="name" required maxLength={200} />
        </label>
      </div>

      <label className="field-label">
        Omschrijving
        <textarea className="field-input min-h-28 resize-y" name="description" />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field-label">
          Type unit
          <input className="field-input" name="unit_type" maxLength={100} />
        </label>
        <label className="field-label">
          Aantal units
          <input
            className="field-input"
            name="quantity"
            type="number"
            min="1"
            step="1"
            defaultValue="1"
            required
          />
        </label>
      </div>

      <div className="mt-2 flex justify-end gap-3">
        <Link className="button-secondary" href="/">
          Annuleren
        </Link>
        <button className="button-primary" type="submit" disabled={pending}>
          {pending ? "Bezig met opslaan…" : "Project opslaan"}
        </button>
      </div>
    </form>
  );
}
