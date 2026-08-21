"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-20 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
        Er ging iets mis
      </h1>
      <p className="mt-2 text-slate-600">
        De actie kon niet worden afgerond. Probeer het opnieuw; blijft het misgaan,
        meld dan de onderstaande melding.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        {error.message}
      </pre>
      <button className="button-primary mt-6" type="button" onClick={reset}>
        Opnieuw proberen
      </button>
    </main>
  );
}
