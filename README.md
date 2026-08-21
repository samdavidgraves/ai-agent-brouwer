# AI Agent Brouwer

Interne webapplicatie voor de werkvoorbereiding van Brouwer Units (Zeewolde).

Doel op termijn: AI inzetten als **digitale tweede controleur** die werkvoorbereidingen
nakijkt op ontbrekende informatie, tegenstrijdigheden, afwijkende aantallen, mogelijke
fouten en productie-aandachtspunten. De AI beslist nooit zelf — de werkvoorbereider
blijft verantwoordelijk voor de beoordeling.

**Huidige versie: v0.2 — de volledige analyseketen werkt, uitsluitend voor PDF-documenten.
Er wordt standaard geen betaalde AI-API aangeroepen.**

## Wat werkt

1. Dashboard met alle projecten
2. Nieuw project aanmaken
3. Projectgegevens invoeren en inzien
4. Documenten uploaden en koppelen aan een project
5. Documenten openen en verwijderen
6. **PDF-tekst uitlezen bij upload** (v0.2)
7. **Analyse voorbereiden**: zien welke tekst is uitgelezen en wat er beoordeeld wordt (v0.2)
8. **Controle uitvoeren** via een verwisselbare provider (v0.2)
9. **Bevindingen inzien met bronverwijzing en beoordelen** (v0.2)

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
Supabase (Postgres + Storage) · unpdf (PDF-tekstextractie) · Vitest ·
optioneel OpenAI (Responses API met structured output)

## Installatie

### 1. Dependencies

```bash
npm install
```

### 2. Supabase-project

Maak een project aan op [supabase.com](https://supabase.com) en voer daarna de scripts
uit `supabase/` uit via **Dashboard → SQL Editor → New query**, in volgorde. Zie
[supabase/README.md](supabase/README.md) voor het overzicht.

1. `schema.sql` — `projects`, `project_documents`, private storage bucket
2. `migrations/0002_ai_analysis.sql` — `document_contents`, `ai_checks`, `ai_findings`

Lukt het aanmaken van de bucket niet vanwege rechten, maak hem dan handmatig aan via
**Storage → New bucket**, naam `project-documents`, **Public uitgeschakeld**.

### 3. Omgevingsvariabelen

Kopieer `.env.example` naar `.env.local` en vul in:

| Variabele | Waar te vinden | Verplicht | Toelichting |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API | ja | Kale project-URL, zonder `/rest/v1` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys | ja | **Geheim.** Alleen server-side |
| `AI_PROVIDER` | — | nee | Leeg = testprovider. `openai` schakelt de betaalde API in |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | alleen bij `AI_PROVIDER=openai` | **Geheim.** Alleen server-side |
| `OPENAI_MODEL` | — | nee | Standaard `gpt-5.6-terra` |

De applicatie draait volledig zonder `OPENAI_API_KEY`. Zolang `AI_PROVIDER` niet op
`openai` staat, wordt er geen externe API aangeroepen en zijn er geen API-kosten.

`.env*` staat in `.gitignore`, met een uitzondering voor `.env.example`. Commit nooit
een ingevulde versie.

### 4. Starten

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Zonder ingevulde `.env.local` start de applicatie gewoon, maar toont ze een melding
dat Supabase nog niet gekoppeld is.

## Scripts

| Commando | Doel |
| --- | --- |
| `npm run dev` | Ontwikkelserver |
| `npm run build` | Productiebuild |
| `npm start` | Productieserver (na build) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Routetypes genereren + TypeScript controleren |
| `npm test` | Unittests (raken de database niet) |
| `npm run test:db` | Integratietests tegen de echte Supabase-database |

## Structuur

```
src/
  app/
    page.tsx                              Dashboard
    projecten/nieuw/page.tsx              Nieuw project
    projecten/[projectId]/page.tsx        Projectpagina
    api/projecten/[projectId]/documenten  Upload (POST)
    api/documenten/[documentId]           Download via signed URL (GET)
  components/                             Gedeelde presentatiecomponenten
  features/
    projects/                             Queries, server actions, formulier
    documents/                            Upload, verwijderen, PDF-extractie
    ai/
      prompts/                            Controleprofielen, per versie
      providers/                          Providerinterface, mock en OpenAI
      prepare-analysis.ts                 PDF's lezen en controle-invoer opbouwen
      build-input.ts                      Documenttekst omzetten naar analyse-invoer
      schema.ts                           Verplichte vorm van het antwoord
      verify-findings.ts                  Bronverificatie van bevindingen
      run-check.ts                        Orchestratie van de hele keten
      limits.ts                           Harde grenzen (geheugen, kosten)
  lib/
    documents.ts                          Bestandsregels en formattering
    supabase/server.ts                    Server-side Supabase-client
  types/database.ts                       Databasetypes
supabase/                                 Schema en migraties
```

## Controle

De keten: PDF upload → tekst uitlezen (`unpdf`) → opslaan in `document_contents` →
tekst koppelen aan document en pagina → controle-invoer opbouwen → analyse door de
actieve **provider** → **bronverificatie** → opslaan in `ai_findings` → tonen en
beoordelen.

### Providers

De analyse zit achter één interface (`src/features/ai/providers/types.ts`), zodat er
later een andere bron bij kan zonder dat de database, UI of controle-engine verandert.

| Provider | Wanneer actief | Kosten |
| --- | --- | --- |
| `MockAiProvider` | standaard | geen |
| `OpenAiProvider` | `AI_PROVIDER=openai` + sleutel | betaald |

De testprovider verzint bewust **geen** realistisch ogende fouten: dat zou de indruk
wekken dat er echt iets mis is met een dossier. Ze levert vaste, deterministische
bevindingen met "Testbevinding" in de titel, met citaten uit de échte documenttekst —
zodat de bronverificatie werkelijk wordt uitgeoefend. Eén testbevinding verwijst met
opzet naar een niet-bestaande passage, om aan te tonen dat het vangnet die tegenhoudt.

Een nieuwe provider toevoegen: implementeer `AiProvider` en registreer die in
`src/features/ai/providers/index.ts`. De bronverificatie blijft buiten de provider,
zodat elke bron dezelfde bewijslast heeft.

### Analyse voorbereiden

De knop **Analyse voorbereiden** doorloopt de hele keten tot vlak vóór de analyse en
laat zien welke tekst per document en pagina is uitgelezen, plus de opgebouwde invoer.
Zo is vooraf controleerbaar wat er beoordeeld wordt — zonder enige API-aanroep.

**Geen bron betekent geen bevinding.** Elke bevinding die de AI teruggeeft, wordt
server-side gecontroleerd: het citaat moet letterlijk terug te vinden zijn in de
uitgelezen documenttekst. Lukt dat niet, dan wordt de bevinding weggegooid en nooit
getoond. Het paginanummer komt uit de gevonden plek, niet uit het antwoord van de AI.
Zie `src/features/ai/verify-findings.ts`.

De severity geeft het sóórt bevinding aan:

| Severity | Betekenis |
| --- | --- |
| `high` | Mogelijke afwijking — concrete tegenstrijdige informatie |
| `medium` | Ontbrekende gegevens — informatie ontbreekt aantoonbaar |
| `low` | Aandachtspunt — reden om na te kijken, geen bewijs van een fout |

Daarnaast komt er per bevinding een `confidence`. De werkvoorbereider beoordeelt
elke bevinding als **terecht**, **onterecht** of **nader controleren**; die keuze komt
in `ai_findings.status` met een tijdstip, voor de pilotmeting.

Het controleprofiel staat in `src/features/ai/prompts/`, met een versienaam
(`work-preparation-v1`) die bij elke `ai_checks`-rij wordt vastgelegd. Pas een prompt
nooit in plaats aan; maak een nieuwe versie, dan blijven oude resultaten vergelijkbaar.

## Documenten

Toegestaan: `pdf`, `xlsx`, `xls`, `docx`, `csv`, `png`, `jpg`, `jpeg` — maximaal 25 MB
per bestand. De regels staan op één plek (`src/lib/documents.ts`) en worden zowel in de
browser als op de server toegepast; de bucket handhaaft ze bovendien zelf.

Opslagpad: `projects/{project_id}/{uuid}-{bestandsnaam}`. De unieke prefix voorkomt dat
een tweede upload met dezelfde naam de eerste overschrijft. De originele bestandsnaam
staat in de database.

Uploaden loopt via een route handler in plaats van een server action, omdat server
actions een standaard body-limiet van 1 MB hebben.

## Beveiliging

- Geen sleutels in de code; alles via omgevingsvariabelen.
- Alle tabellen hebben RLS aan **zonder policies**: niemand komt er met de anon key of
  als ingelogde gebruiker rechtstreeks bij. Alle toegang loopt via de Next.js server met
  de service role key.
- De storage bucket is privaat. Downloads gaan via een signed URL die 60 seconden geldig is.
- `src/lib/supabase/server.ts` en `src/features/ai/openai.ts` importeren `server-only`,
  zodat de build faalt als de service role key of de OpenAI-sleutel ooit in een client
  component belandt.
- De OpenAI-sleutel wordt alleen in `src/features/ai/providers/openai.ts` gelezen en gaat
  nooit naar de browser. Standaard wordt er helemaal geen externe API aangeroepen; pas met
  `AI_PROVIDER=openai` gaat documenttekst het pand uit. De PDF's zelf blijven altijd in de
  private bucket.

> **Nog te doen:** er is nog geen authenticatie. Iedereen die de applicatie kan bereiken,
> kan alle projecten zien en wijzigen. Zet de applicatie daarom nog niet publiek toegankelijk
> neer voordat inloggen is toegevoegd.

## Beperkingen van v0.2

- De standaardprovider is een testprovider: de keten werkt, maar de bevindingen zijn niet
  inhoudelijk. Zet `AI_PROVIDER=openai` zodra een echte analyse gewenst is.
- Alleen PDF. Excel, Word, CSV en afbeeldingen worden wel opgeslagen, maar niet gelezen.
- Alleen tekstgebaseerde PDF's. Gescande documenten en tekeningen leveren geen tekst op;
  OCR volgt later.
- De controle draait synchroon in het verzoek. Bij zeer veel of zeer grote documenten kan
  dat tegen een timeout aanlopen; een wachtrij volgt later.
- Nog geen authenticatie.

## Volgende stappen

1. Authenticatie (Supabase Auth) + RLS-policies per gebruiker/rol
2. OCR voor gescande PDF's en tekeningen
3. Excel- en Word-documenten meenemen in de analyse
4. Controleprofielen per type unit
5. Rapportage en pilotmeting op basis van `ai_findings.status`
