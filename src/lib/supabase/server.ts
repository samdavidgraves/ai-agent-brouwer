import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase-client voor gebruik op de server.
 *
 * Gebruikt de service role key, die Row Level Security omzeilt. Beide tabellen
 * staan in de database volledig dicht (RLS aan, geen policies), dus dit is de
 * enige weg naar de data. De import van "server-only" bovenaan zorgt ervoor dat
 * de build faalt als dit bestand ooit in een client component belandt.
 */
let cachedClient: SupabaseClient | null = null;

function readConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

/** Of de omgevingsvariabelen voor Supabase zijn ingevuld. */
export function isSupabaseConfigured(): boolean {
  return readConfig() !== null;
}

/** Geeft `null` terug wanneer Supabase nog niet is geconfigureerd. */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const config = readConfig();
  if (!config) return null;

  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/** Zoals `getSupabaseClient`, maar werpt een leesbare fout bij ontbrekende configuratie. */
export function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase is nog niet geconfigureerd. Vul NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in .env.local in.",
    );
  }
  return client;
}
