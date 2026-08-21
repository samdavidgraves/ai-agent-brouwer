-- AI Agent Brouwer - migratie 0003: Brouwer-controleprofiel en pilotmeting (v0.3)
--
-- Vereist 0001 (supabase/schema.sql) en 0002. Uitvoeren in de Supabase SQL Editor.
-- Het script is idempotent en verruimt geen enkele toegang: RLS blijft aan, er
-- worden geen policies toegevoegd.

-- ---------------------------------------------------------------------------
-- 1. Documentrol
-- ---------------------------------------------------------------------------
--
-- De werkvoorbereider geeft zelf aan wat een document is. Zonder rol kan de
-- controle niet weten wat ze waarmee moet vergelijken, dus 'unknown' betekent:
-- dit document doet niet mee aan de vergelijkende controles.

alter table public.project_documents
  add column if not exists document_role text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_documents_document_role_check'
  ) then
    alter table public.project_documents
      add constraint project_documents_document_role_check
      check (document_role in ('offer', 'drawing', 'bill_of_materials',
                               'specification', 'other', 'unknown'));
  end if;
end;
$$;

comment on column public.project_documents.document_role is
  'offer = offerte, drawing = tekening, bill_of_materials = stuklijst, specification = specificatie, other = overig, unknown = nog niet aangegeven';

-- ---------------------------------------------------------------------------
-- 2. Soort bevinding en controlegebied
-- ---------------------------------------------------------------------------
--
-- finding_type staat los van severity. severity zegt hoe zwaar het weegt,
-- finding_type zegt wat voor soort constatering het is:
--   discrepancy = concreet bewijs van tegenstrijdigheid tussen twee bronnen
--   missing     = op basis van een bron verwacht, niet teruggevonden in een andere
--   attention   = onvoldoende informatie om iets vast te stellen, verdient controle

alter table public.ai_findings
  add column if not exists finding_type text not null default 'attention';

alter table public.ai_findings
  add column if not exists check_area text not null default 'general';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_findings_finding_type_check'
  ) then
    alter table public.ai_findings
      add constraint ai_findings_finding_type_check
      check (finding_type in ('discrepancy', 'missing', 'attention'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_findings_check_area_check'
  ) then
    alter table public.ai_findings
      add constraint ai_findings_check_area_check
      check (check_area in ('offer_vs_drawing', 'drawing_vs_bom', 'offer_vs_bom',
                            'dimensions', 'location', 'general'));
  end if;
end;
$$;

comment on column public.ai_findings.finding_type is
  'discrepancy = aantoonbare tegenstrijdigheid, missing = verwacht maar niet teruggevonden, attention = te weinig informatie om te concluderen';
comment on column public.ai_findings.check_area is
  'Welke van de vijf controles deze bevinding opleverde. general = bevindingen van voor v0.3.';

-- Tweede brondocument, voor bevindingen die twee bronnen vergelijken. Optioneel:
-- het primaire source_document_id blijft verplicht en houdt de bewijslast intact.
alter table public.ai_findings
  add column if not exists compared_document_id uuid
  references public.project_documents (id) on delete cascade;

comment on column public.ai_findings.compared_document_id is
  'Het tweede document bij een vergelijking, bijvoorbeeld de tekening bij een offerte-bevinding.';

create index if not exists ai_findings_check_area_idx
  on public.ai_findings (check_area);

-- ---------------------------------------------------------------------------
-- 3. Pilotmeting op ai_checks
-- ---------------------------------------------------------------------------

alter table public.ai_checks
  add column if not exists profile_label text;
alter table public.ai_checks
  add column if not exists duration_ms integer;
alter table public.ai_checks
  add column if not exists documents_analyzed integer not null default 0;
alter table public.ai_checks
  add column if not exists documents_unsupported integer not null default 0;
alter table public.ai_checks
  add column if not exists findings_rejected integer not null default 0;

comment on column public.ai_checks.duration_ms is
  'Duur van de controle in milliseconden, vastgelegd bij afronden.';
comment on column public.ai_checks.findings_rejected is
  'Aantal bevindingen dat is weggegooid omdat de bron niet controleerbaar was.';
comment on column public.ai_checks.documents_unsupported is
  'Aantal documenten dat is opgeslagen maar niet geanalyseerd, bijvoorbeeld Inventor- en Revit-bestanden.';

-- ---------------------------------------------------------------------------
-- 4. Storage: Inventor- en Revit-bestanden mogen worden opgeslagen
-- ---------------------------------------------------------------------------
--
-- Deze bestanden worden NIET geanalyseerd; ze worden alleen bewaard. Browsers
-- sturen er meestal application/octet-stream voor mee. De extensiecontrole in
-- src/lib/documents.ts blijft leidend.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'image/png',
  'image/jpeg',
  'application/octet-stream'
]
where id = 'project-documents';

-- ---------------------------------------------------------------------------
-- 5. Pilotmeting: leesbare view
-- ---------------------------------------------------------------------------
--
-- Geen dashboard, alleen een handige weergave om later op te meten.
-- security_invoker zorgt dat de view de rechten van de aanroeper gebruikt en
-- dus geen RLS omzeilt.

create or replace view public.pilot_check_metrics
with (security_invoker = true) as
select
  c.id                       as ai_check_id,
  c.project_id,
  p.project_number,
  c.status,
  c.model,
  c.prompt_version,
  c.profile_label,
  c.started_at,
  c.completed_at,
  c.duration_ms,
  c.documents_analyzed,
  c.documents_unsupported,
  c.findings_rejected,
  count(f.id)                                                  as findings_total,
  count(f.id) filter (where f.finding_type = 'discrepancy')    as findings_discrepancy,
  count(f.id) filter (where f.finding_type = 'missing')        as findings_missing,
  count(f.id) filter (where f.finding_type = 'attention')      as findings_attention,
  count(f.id) filter (where f.status = 'accepted')             as reviewed_accepted,
  count(f.id) filter (where f.status = 'rejected')             as reviewed_rejected,
  count(f.id) filter (where f.status = 'needs_review')         as reviewed_needs_review,
  count(f.id) filter (where f.status = 'open')                 as reviewed_open
from public.ai_checks c
join public.projects p on p.id = c.project_id
left join public.ai_findings f on f.ai_check_id = c.id
group by c.id, p.project_number;

comment on view public.pilot_check_metrics is
  'Meetgegevens per uitgevoerde controle voor de pilot. Alleen lezen.';

-- ---------------------------------------------------------------------------
-- 6. RLS ongewijzigd
-- ---------------------------------------------------------------------------
--
-- Geen nieuwe policies. Deze regels zijn puur defensief, voor het geval een
-- eerdere uitvoering iets anders achterliet.

alter table public.projects           enable row level security;
alter table public.project_documents  enable row level security;
alter table public.document_contents  enable row level security;
alter table public.ai_checks          enable row level security;
alter table public.ai_findings        enable row level security;
