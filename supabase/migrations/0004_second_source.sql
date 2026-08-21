-- AI Agent Brouwer - migratie 0004: tweede bron per bevinding (v0.4)
--
-- Vereist 0001 t/m 0003. Uitvoeren in de Supabase SQL Editor.
-- Idempotent. Verruimt geen toegang: RLS blijft aan, geen policies.

-- ---------------------------------------------------------------------------
-- Tweede bronverwijzing
-- ---------------------------------------------------------------------------
--
-- Een vergelijkende bevinding rust op twee documenten. Tot nu toe legden we alleen
-- het tweede document vast (compared_document_id), maar niet wát daar stond.
-- Zonder dat citaat kan de werkvoorbereider de andere helft niet nakijken.

alter table public.ai_findings
  add column if not exists compared_reference text;
alter table public.ai_findings
  add column if not exists compared_quote text;

comment on column public.ai_findings.compared_reference is
  'Paginaverwijzing binnen het tweede document, bijvoorbeeld "Pagina 2".';
comment on column public.ai_findings.compared_quote is
  'Letterlijke passage uit het tweede document. Server-side geverifieerd, net als source_quote.';

-- Bestaande rijen opschonen voordat de constraint erop komt.
--
-- Bevindingen van voor deze migratie kunnen wel een tweede document hebben, maar
-- nooit een tweede citaat: die kolom bestond nog niet. Zonder controleerbaar citaat
-- is die verwijzing waardeloos, en dat is precies de regel die de applicatie zelf
-- hanteert in verify-findings.ts. We laten de verwijzing daarom vallen; de bevinding
-- zelf blijft bestaan, met haar primaire bron en citaat.
update public.ai_findings
set compared_document_id = null,
    compared_reference = null
where compared_document_id is not null
  and (compared_quote is null or compared_quote = '');

-- Beide velden horen samen te bestaan met het tweede document.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_findings_compared_complete_check'
  ) then
    alter table public.ai_findings
      add constraint ai_findings_compared_complete_check
      check (
        (compared_document_id is null and compared_quote is null)
        or (compared_document_id is not null and compared_quote is not null)
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Herkomst van de documenten
-- ---------------------------------------------------------------------------
--
-- Vandaag komt alles uit handmatige upload. Zodra er een koppeling met het
-- Brouwer-intranet komt, is achteraf te zien welke controle op welke bron draaide.

alter table public.project_documents
  add column if not exists source_id text not null default 'upload';

comment on column public.project_documents.source_id is
  'Waar het document vandaan komt: upload (handmatig) of later bijvoorbeeld intranet.';

alter table public.ai_checks
  add column if not exists source_id text;

comment on column public.ai_checks.source_id is
  'Welke documentbron deze controle gebruikte.';

-- ---------------------------------------------------------------------------
-- Stuklijstgegevens per document
-- ---------------------------------------------------------------------------
--
-- Voor een stuklijst bewaren we hoeveel bronregels zijn verwerkt en hoeveel
-- subprojecten erin zaten. Dat is nodig om aantallen te kunnen duiden: 1000 WCD
-- over 100 subprojecten is 10 per unit.

alter table public.document_contents
  add column if not exists row_count integer;
alter table public.document_contents
  add column if not exists subproject_count integer;

comment on column public.document_contents.row_count is
  'Aantal verwerkte bronregels, voor stuklijst-exports.';
comment on column public.document_contents.subproject_count is
  'Aantal subprojecten in de export, bijvoorbeeld 100 schaftwagens.';

-- ---------------------------------------------------------------------------
-- RLS ongewijzigd
-- ---------------------------------------------------------------------------

alter table public.projects           enable row level security;
alter table public.project_documents  enable row level security;
alter table public.document_contents  enable row level security;
alter table public.ai_checks          enable row level security;
alter table public.ai_findings        enable row level security;
