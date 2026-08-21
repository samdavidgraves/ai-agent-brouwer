import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Zonder Supabase-configuratie draait de applicatie wel, maar kan er niets
 * worden opgeslagen. Dat moet zichtbaar zijn in plaats van als lege lijst.
 */
export function SupabaseNotice() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <p className="font-semibold">Supabase is nog niet gekoppeld</p>
      <p className="mt-1">
        Vul <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> en{" "}
        <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in{" "}
        <code className="font-mono">.env.local</code> in en voer{" "}
        <code className="font-mono">supabase/schema.sql</code> uit. Tot die tijd kunnen
        projecten en documenten niet worden opgeslagen.
      </p>
    </div>
  );
}
