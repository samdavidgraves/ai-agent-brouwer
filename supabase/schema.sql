-- AI Agent Brouwer - databaseschema v0.1
--
-- Uitvoeren in de Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Het script is idempotent: opnieuw uitvoeren is veilig.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  project_number text        not null unique,
  name           text        not null,
  description    text,
  unit_type      text,
  quantity       integer     not null default 1 check (quantity >= 1),
  status         text        not null default 'draft'
                 check (status in ('draft', 'ready_for_check', 'checking', 'completed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.projects.status is
  'draft = concept, ready_for_check = gereed voor controle, checking = in controle, completed = afgerond';

-- ---------------------------------------------------------------------------
-- project_documents
-- ---------------------------------------------------------------------------

create table if not exists public.project_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid        not null references public.projects (id) on delete cascade,
  file_name    text        not null,
  file_type    text        not null,
  storage_path text        not null unique,
  file_size    bigint      not null check (file_size > 0),
  created_at   timestamptz not null default now()
);

comment on column public.project_documents.file_type is
  'Genormaliseerde extensie zonder punt, bijvoorbeeld pdf of xlsx';
comment on column public.project_documents.storage_path is
  'Pad binnen de storage bucket project-documents, opgebouwd als projects/{project_id}/{bestand}';

create index if not exists project_documents_project_id_idx
  on public.project_documents (project_id);

-- ---------------------------------------------------------------------------
-- updated_at automatisch bijwerken
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Beide tabellen staan bewust volledig dicht: RLS is aan en er zijn geen
-- policies. Daardoor kan niemand met de anon key of een ingelogde gebruiker
-- rechtstreeks bij de data. Alle toegang loopt via de Next.js server, die de
-- service role key gebruikt (die RLS omzeilt).
--
-- Zodra er inlog met Supabase Auth komt, worden hier policies toegevoegd
-- (bijvoorbeeld: alleen medewerkers van Brouwer Units) en kan de server
-- overstappen op de anon key met de sessie van de gebruiker.

alter table public.projects          enable row level security;
alter table public.project_documents enable row level security;

-- Eventuele policies uit een eerdere versie opruimen, zodat "dicht" ook echt
-- dicht is na een herhaalde uitvoering van dit script.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('projects', 'project_documents')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
--
-- Private bucket voor projectdocumenten. Downloads lopen via tijdelijke
-- signed URLs die de server aanmaakt.
--
-- Werkt dit blok niet vanwege rechten, maak de bucket dan handmatig aan via
-- Dashboard > Storage > New bucket, met naam "project-documents" en Public
-- uitgeschakeld.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-documents',
  'project-documents',
  false,
  26214400, -- 25 MB, gelijk aan MAX_FILE_SIZE_BYTES in src/lib/documents.ts
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects heeft standaard RLS aan. Er worden bewust geen policies
-- toegevoegd, zodat alleen de service role bij de bestanden kan.
