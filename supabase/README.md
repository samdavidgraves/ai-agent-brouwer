# Supabase - uitvoeringsvolgorde

Uitvoeren in de Supabase SQL Editor (Dashboard → SQL Editor → New query), in deze
volgorde. Alle scripts zijn idempotent: opnieuw uitvoeren is veilig.

| # | Bestand | Inhoud | Versie |
| --- | --- | --- | --- |
| 1 | `schema.sql` | `projects`, `project_documents`, storage bucket `project-documents` | v0.1 |
| 2 | `migrations/0002_ai_analysis.sql` | `document_contents`, `ai_checks`, `ai_findings` | v0.2 |

Alle tabellen hebben Row Level Security aan **zonder policies**. Dat is opzet: niemand
komt er met de anon key of als ingelogde gebruiker rechtstreeks bij. Alle toegang loopt
via de Next.js server met de service role key. Zodra authenticatie wordt toegevoegd,
komen hier policies bij.
