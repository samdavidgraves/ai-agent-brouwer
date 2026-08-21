-- AI Agent Brouwer - migratie 0002: documentanalyse en AI-controle (v0.2)
--
-- Vereist dat 0001 (supabase/schema.sql) al is uitgevoerd.
-- Uitvoeren in de Supabase SQL Editor. Het script is idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- document_contents - uitgelezen tekst per document
-- ---------------------------------------------------------------------------
--
-- Eén rij per document (unique op document_id). De originele PDF in storage
-- wordt nooit gewijzigd; dit is puur een afgeleide tekstversie.

create table if not exists public.document_contents (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid        not null unique
                    references public.project_documents (id) on delete cascade,
  extracted_text    text,
  extraction_status text        not null default 'pending'
                    check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extraction_error  text,
  page_count        integer,
  truncated         boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.document_contents.truncated is
  'true wanneer de tekst is afgekapt op MAX_EXTRACTED_CHARS uit src/features/ai/limits.ts';

-- ---------------------------------------------------------------------------
-- ai_checks - één uitgevoerde AI-controle per project
-- ---------------------------------------------------------------------------

create table if not exists public.ai_checks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid        not null references public.projects (id) on delete cascade,
  status         text        not null default 'pending'
                 check (status in ('pending', 'processing', 'completed', 'failed')),
  model          text,
  prompt_version text,
  started_at     timestamptz,
  completed_at   timestamptz,
  error          text,
  created_at     timestamptz not null default now()
);

comment on column public.ai_checks.prompt_version is
  'Versie van het controleprofiel, bijvoorbeeld work-preparation-v1. Vastgelegd zodat later te meten is welke promptversie welke resultaten gaf.';

create index if not exists ai_checks_project_id_idx
  on public.ai_checks (project_id, created_at desc);

-- Hooguit één lopende controle per project. Dit is de harde rem op dubbele
-- clicks: een tweede insert faalt met een unique violation.
create unique index if not exists ai_checks_one_active_per_project
  on public.ai_checks (project_id)
  where status in ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- ai_findings - bevindingen uit een controle
-- ---------------------------------------------------------------------------
--
-- source_document_id is NOT NULL en cascade: een bevinding zonder controleerbare
-- bron mag niet bestaan. Verdwijnt het brondocument, dan verdwijnt de bevinding.

create table if not exists public.ai_findings (
  id                 uuid primary key default gen_random_uuid(),
  ai_check_id        uuid        not null references public.ai_checks (id) on delete cascade,
  severity           text        not null check (severity in ('high', 'medium', 'low')),
  category           text        not null
                     check (category in ('completeness', 'consistency', 'quantity',
                                         'logical', 'production', 'other')),
  title              text        not null,
  description        text        not null,
  source_document_id uuid        not null
                     references public.project_documents (id) on delete cascade,
  source_reference   text        not null,
  source_quote       text        not null,
  confidence         text        not null check (confidence in ('high', 'medium', 'low')),
  status             text        not null default 'open'
                     check (status in ('open', 'accepted', 'rejected', 'needs_review')),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

comment on column public.ai_findings.source_quote is
  'Letterlijke passage uit de uitgelezen documenttekst. Server-side geverifieerd: vindt de passage niet terug in het document, dan wordt de bevinding verworpen.';
comment on column public.ai_findings.status is
  'open = nog niet beoordeeld, accepted = terecht, rejected = onterecht, needs_review = nader controleren';
comment on column public.ai_findings.reviewed_at is
  'Moment waarop de werkvoorbereider de bevinding beoordeelde. Voor de pilotmeting.';

create index if not exists ai_findings_check_id_idx
  on public.ai_findings (ai_check_id);

-- ---------------------------------------------------------------------------
-- updated_at bijwerken (functie bestaat al sinds 0001)
-- ---------------------------------------------------------------------------

drop trigger if exists document_contents_set_updated_at on public.document_contents;
create trigger document_contents_set_updated_at
  before update on public.document_contents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Zelfde model als 0001: RLS aan, geen policies. Alle toegang loopt via de
-- Next.js server met de service role key.

alter table public.document_contents enable row level security;
alter table public.ai_checks         enable row level security;
alter table public.ai_findings       enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('document_contents', 'ai_checks', 'ai_findings')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end;
$$;
