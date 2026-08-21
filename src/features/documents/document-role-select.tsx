"use client";

import { useRef } from "react";

import { ROLE_LABELS } from "@/features/ai/build-input";
import { updateDocumentRole } from "@/features/documents/actions";
import { DOCUMENT_ROLES } from "@/types/database";

/**
 * De rol per document aanpassen. Slaat direct op bij wijzigen, zonder aparte
 * opslaan-knop: het is één keuze en die moet snel te corrigeren zijn.
 */
export function DocumentRoleSelect({
  documentId,
  projectId,
  role,
}: {
  documentId: string;
  projectId: string;
  role: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={updateDocumentRole} ref={formRef}>
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="project_id" value={projectId} />
      <select
        name="document_role"
        defaultValue={role}
        aria-label="Documentrol"
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100"
      >
        {DOCUMENT_ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </select>
      <noscript>
        <button className="mt-1 text-xs font-medium text-cyan-800" type="submit">
          Opslaan
        </button>
      </noscript>
    </form>
  );
}
