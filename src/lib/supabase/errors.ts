import type { PostgrestError } from "@supabase/supabase-js";

/** PostgREST meldt een ontbrekende tabel met deze code. */
const MISSING_TABLE_CODE = "PGRST205";

/**
 * Of de fout betekent: deze tabel bestaat nog niet.
 *
 * Zo kan de applicatie blijven werken wanneer een migratie nog niet is uitgevoerd,
 * in plaats van de hele pagina te laten crashen op een technische foutmelding.
 */
export function isMissingTableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  return error.code === MISSING_TABLE_CODE || /could not find the table/i.test(error.message);
}

/** Postgres meldt een onbekende kolom met SQLSTATE 42703. */
const MISSING_COLUMN_CODE = "42703";

/**
 * Of de fout betekent: deze kolom bestaat nog niet.
 *
 * Zo blijft de applicatie werken wanneer een migratie nog niet is uitgevoerd,
 * in plaats van een harde fout te geven op een half bijgewerkt schema.
 */
export function isMissingColumnError(error: PostgrestError | null): boolean {
  if (!error) return false;
  return (
    error.code === MISSING_COLUMN_CODE ||
    /column .* does not exist|could not find the '.*' column/i.test(error.message)
  );
}
