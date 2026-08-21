import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
        Pagina niet gevonden
      </h1>
      <p className="mt-2 text-slate-600">
        Dit project bestaat niet (meer) of de link klopt niet.
      </p>
      <Link className="button-primary mt-6" href="/">
        Naar het projectoverzicht
      </Link>
    </main>
  );
}
