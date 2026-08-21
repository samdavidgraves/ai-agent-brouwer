"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ROLE_LABELS } from "@/features/ai/build-input";
import { DOCUMENT_ROLES, type DocumentRole } from "@/types/database";

import {
  FILE_INPUT_ACCEPT,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_FILE_TYPES,
  formatFileSize,
  validateUpload,
} from "@/lib/documents";

type UploadError = { fileName: string; message: string };

export function DocumentUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<DocumentRole>("unknown");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setBusy(true);
    setErrors([]);
    setUploadedCount(0);

    const failures: UploadError[] = [];
    let succeeded = 0;

    // Bewust één voor één: zo weet de gebruiker precies welk bestand faalt.
    for (const file of files) {
      // Dezelfde controle draait ook op de server; hier scheelt het een
      // vergeefse upload van een groot bestand.
      const validation = validateUpload(file.name, file.size);
      if (!validation.ok) {
        failures.push({ fileName: file.name, message: validation.message });
        continue;
      }

      const body = new FormData();
      body.append("file", file);
      body.append("document_role", role);

      try {
        const response = await fetch(`/api/projecten/${projectId}/documenten`, {
          method: "POST",
          body,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          failures.push({
            fileName: file.name,
            message: payload?.error ?? `Uploaden mislukt (${response.status}).`,
          });
          continue;
        }

        succeeded += 1;
        setUploadedCount(succeeded);
      } catch {
        failures.push({
          fileName: file.name,
          message: "Geen verbinding met de server.",
        });
      }
    }

    setErrors(failures);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (succeeded > 0) router.refresh();
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
      <label className="field-label mb-4 max-w-xs">
        Documentrol
        <select
          className="field-input"
          value={role}
          disabled={busy}
          onChange={(event) => setRole(event.target.value as DocumentRole)}
        >
          {DOCUMENT_ROLES.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        Documenten toevoegen
        <input
          ref={inputRef}
          className="field-input bg-white file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          type="file"
          multiple
          accept={FILE_INPUT_ACCEPT}
          disabled={busy}
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
          }}
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">
        De rol geldt voor de bestanden die je nu kiest; je kunt hem daarna per document
        aanpassen. Toegestaan: {Object.keys(ALLOWED_FILE_TYPES).join(", ")} · maximaal{" "}
        {formatFileSize(MAX_FILE_SIZE_BYTES)} per bestand. Geanalyseerd worden:
        PDF (offerte, tekening) en xlsx (stuklijst-export). Inventor- en Revit-bestanden
        worden opgeslagen, analyse daarvan is momenteel niet ondersteund.
      </p>

      {busy && (
        <p className="mt-3 text-sm font-medium text-slate-700" role="status">
          Bezig met uploaden… {uploadedCount > 0 && `${uploadedCount} gereed`}
        </p>
      )}

      {errors.length > 0 && (
        <ul
          role="alert"
          className="mt-3 space-y-1 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errors.map((error) => (
            <li key={error.fileName}>
              <span className="font-medium">{error.fileName}</span>: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
