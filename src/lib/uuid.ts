const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Alle id's zijn UUID's. Door een waarde uit de URL eerst hier langs te sturen
 * geeft Postgres geen type-fout (en dus geen 500) op een willekeurig pad.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
