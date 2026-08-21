"use client";

import { useFormStatus } from "react-dom";

import { deleteDocument } from "@/features/documents/actions";

export function DeleteDocumentButton({
  documentId,
  fileName,
}: {
  documentId: string;
  fileName: string;
}) {
  return (
    <form
      action={deleteDocument}
      onSubmit={(event) => {
        if (!confirm(`"${fileName}" definitief verwijderen?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="document_id" value={documentId} />
      <SubmitButton fileName={fileName} />
    </form>
  );
}

function SubmitButton({ fileName }: { fileName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`${fileName} verwijderen`}
      className="rounded-md px-2 py-1 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Bezig…" : "Verwijderen"}
    </button>
  );
}
