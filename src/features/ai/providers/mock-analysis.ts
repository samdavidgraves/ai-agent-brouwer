/**
 * Analyselogica van de testprovider.
 *
 * Dit is GEEN AI. Het is eenvoudige, deterministische patroonherkenning die de vijf
 * controles nabootst, zodat de hele keten met echte documenten getest kan worden
 * zonder een betaalde API.
 *
 * Het leidende principe is terughoudendheid. Liever "dit kan ik niet met voldoende
 * zekerheid bepalen" dan een verzonnen afwijking. Concreet:
 *
 * - aantallen uit verschillende bronnen worden nooit blind vergeleken; eerst moet
 *   vaststaan dat ze hetzelfde betekenen (totaal tegenover meerwerk);
 * - een offerteregel wordt alleen aan een stuklijstartikel gekoppeld wanneer die
 *   koppeling in brouwer-rules.ts is vastgelegd. Zonder vastgelegde koppeling is
 *   alles wat de stuklijst raakt hooguit een aandachtspunt;
 * - elke constatering draagt een letterlijk citaat, en bij een vergelijking twee.
 *
 * Los hiervan blijft de bronverificatie in verify-findings.ts gelden.
 */

import { MAX_PLAUSIBLE_COUNT, MIN_SOURCE_QUOTE_CHARS } from "@/features/ai/limits";
import type { RawAiFinding } from "@/features/ai/schema";
import {
  DIMENSION_KEYWORDS,
  DIMENSION_LABELS,
  detectScope,
  findArticleLink,
  findItem,
  isStandardItem,
  LOCATION_KEYWORDS,
  LOCATION_REQUIRED_ITEMS,
  MEASUREMENT_PATTERN,
  normaliseOcrLetters,
  REQUIRED_DIMENSION_RULES,
  TRACKED_ITEMS,
  type ItemDefinition,
  type QuantityScope,
} from "@/features/ai/rules/brouwer-rules";
import type { AnalysisDocument } from "@/features/ai/verify-findings";
import type { DocumentRole } from "@/types/database";

export type ItemMention = {
  item: ItemDefinition;
  line: string;
  /** Citaat, zo nodig aangevuld met een buurregel om vindbaar te zijn. */
  quote: string;
  page: number;
  count: number | null;
  scope: QuantityScope;
};

export type DocumentTally = {
  document: AnalysisDocument;
  index: number;
  mentions: Map<string, ItemMention>;
  /** Alle regels per onderdeel, om herhalingen te kunnen tellen. */
  occurrences: Map<string, number>;
  /**
   * Elke regel waarin het onderdeel voorkomt, in volgorde van de brontekst.
   *
   * Nodig voor onderdelen die uit modules bestaan: een tekening beschrijft twee
   * banken op twee regels, en dan is de som van die regels het aantal in de unit.
   * Voor alle andere onderdelen blijft `mentions` leidend.
   */
  lines: Map<string, ItemMention[]>;
};

const NUMBER_WORDS: Record<string, number> = {
  een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6,
  zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
};

/**
 * Maakt van een korte regel een citaat dat lang genoeg is om terug te vinden, door
 * aangrenzende regels toe te voegen. Stuklijstregels als "2 tafels" zijn anders niet
 * citeerbaar; het resultaat blijft een aaneengesloten passage.
 */
export function buildQuote(lines: string[], index: number): string {
  let start = index;
  let end = index;
  let quote = lines[index] ?? "";

  while (quote.trim().length < MIN_SOURCE_QUOTE_CHARS && (end + 1 < lines.length || start > 0)) {
    if (end + 1 < lines.length) end += 1;
    else start -= 1;
    quote = lines.slice(start, end + 1).join("\n");
  }

  return quote.trim();
}

/**
 * Eenheden die direct achter een getal kunnen staan. Staat er zo'n eenheid, dan is
 * het getal een maat of een technische waarde en geen aantal: "24 Volt", "2400mm",
 * "4000 Kelvin", "IP 68".
 */
const UNIT_AFTER =
  /^\s*(mm2|mm|cm|mtr|meter|m|volt|v|watt|w|va|ah|a|kelvin|k|hz|ip|lm|lux|kg|g|graden|bar)\b/i;

function startsWithUnit(rest: string): boolean {
  // Een getal dat direct tegen een letter aan plakt is nooit een aantal. Dat vangt
  // ook OCR-verminkingen af: de gescande offerte bevat "24Vo114000" waar "24 Volt
  // 4000" hoort te staan, en daar hielp de eenhedenlijst alleen niet tegen.
  if (/^[a-zà-ÿ]/i.test(rest)) return true;
  return UNIT_AFTER.test(rest);
}

function endsWithUnit(before: string): boolean {
  // Zelfde redenering omgekeerd: cijfers die aan een letter vastzitten horen bij een
  // code of een maat, niet bij een aantal.
  if (/[a-zà-ÿ]\d+\s*$/i.test(before)) return true;
  return /\d+\s*(mm|cm|m|volt|v|watt|w|kelvin|k|hz|kg|g)\s*$/i.test(before);
}

/**
 * Een samenstelling zoals "(2x1200)": aantal modules maal modulemaat, zonder
 * spatie ertussen. Dat is een productieaanduiding van één onderdeel, geen telling.
 */
const SAMENSTELLING = /^[^0-9a-z]{0,4}\d+x\d{3,5}(?![0-9a-z])/;

/** Alleen aantallen doorlaten die in een enkele unit plausibel zijn. */
function accept(value: number): number | null {
  return value > 0 && value <= MAX_PLAUSIBLE_COUNT ? value : null;
}

/**
 * Haalt een aantal uit een regel. Geeft `null` wanneer er geen ondubbelzinnig aantal
 * in staat - dan mag er geen afwijking uit volgen.
 *
 * Herkent "4 plafondarmaturen", "plafondarmaturen: 4", "5 stuks Extra WCD",
 * "(2x)" en "vier banken". Maten, spanningen en andere technische waarden tellen
 * niet mee.
 */
export function extractCount(line: string, item: ItemDefinition): number | null {
  const lower = line.toLowerCase();
  const synonym = item.synonyms.find((word) => lower.includes(word));
  if (!synonym) return null;

  const position = lower.indexOf(synonym);
  const before = lower.slice(0, position);
  const after = lower.slice(position + synonym.length);

  // "(2x1200)" aaneengeschreven is GEEN aantal: het is een productieverduidelijking
  // dat een bank van 2400 mm uit twee modules van 1200 mm bestaat. Bevestigd door
  // Brouwer op P251411. Met een spatie ertussen is het wel een telling, want dan
  // staat er "3x 2400mm": drie stuks van 2400 mm.
  const samenstelling = SAMENSTELLING.test(after);

  // "(2x)" of "2x" direct achter het onderdeel is een aantal.
  if (!samenstelling) {
    const trailingTimes = after.match(/^[^0-9a-z]{0,4}(\d+)\s*x(?![a-z])/);
    if (trailingTimes) return accept(Number(trailingTimes[1]));
  }

  // "plafondarmaturen: 4" of "plafondarmaturen 4 stuks".
  // Het getal wordt in zijn geheel gelezen; pas daarna kijken we wat erachter staat.
  // Zonder die scheiding gaf "bank 2400mm" het getal 240, doordat de regex terugviel
  // op drie cijfers zodat "0mm" niet meer als eenheid telde.
  const trailing = after.match(/^\s*[:\-–]?\s*(\d+)/);
  if (trailing) {
    const rest = after.slice(trailing[0].length);
    if (!startsWithUnit(rest)) return accept(Number(trailing[1]));
  }

  // "5 stuks Extra wandcontactdoos" / "1x Pictogrambord ..."
  const stuks = before.match(/(\d+)\s*(?:x|stuks|st\.?|stk)\b[^0-9]*$/);
  if (stuks) return accept(Number(stuks[1]));

  // "4 plafondarmaturen" - getal direct ervoor, niet als het een maat is
  const leading = before.match(/(\d+)\s*$/);
  if (leading && !endsWithUnit(before)) return accept(Number(leading[1]));

  // "aantal: 4 ... plafondarmaturen"
  const aantal = before.match(/aantal\s*[:\-]?\s*(\d+)\s*$/);
  if (aantal) return accept(Number(aantal[1]));

  // "vier banken"
  const word = before.match(/([a-zéë]+)\s*$/);
  if (word && NUMBER_WORDS[word[1]] !== undefined) return NUMBER_WORDS[word[1]];

  return null;
}

/**
 * Of een regel op grond van de uitsluitwoorden niet als onderdeelregel telt.
 *
 * De vergelijking loopt over de OCR-genormaliseerde tekst, zodat "op de bu¡tendeur"
 * uit de gescande offerte hetzelfde uitsluitwoord raakt als "op de buitendeur".
 */
export function isExcluded(line: string, item: ItemDefinition): boolean {
  if (!item.excludeIfLineContains) return false;
  const lower = normaliseOcrLetters(line.toLowerCase());
  return item.excludeIfLineContains.some((word) =>
    lower.includes(normaliseOcrLetters(word.toLowerCase())),
  );
}

/**
 * Haalt de maat in millimeters op die bij een onderdeelvermelding hoort.
 *
 * Alleen bedoeld voor onderdelen met een maatafhankelijke koppeling. Herkent de
 * twee schrijfwijzen die in P251411 voorkomen: "banken 2400mm" in de offerte en
 * "bank (2x1200)" op de tekening. Levert null als er geen maat bij het onderdeel
 * staat; dan wordt er niet omgerekend en dus ook niets vergeleken.
 */
export function extractSizeMm(line: string, item: ItemDefinition): number | null {
  const lower = line.toLowerCase();

  // Langste schrijfwijze eerst: in "banken 2400mm" moet de maat achter "banken"
  // gezocht worden, niet achter de deeltreffer "bank".
  const synonyms = [...item.synonyms].sort((a, b) => b.length - a.length);

  for (const synonym of synonyms) {
    let from = lower.indexOf(synonym);

    while (from !== -1) {
      const after = lower.slice(from + synonym.length);

      // "(2x1200)": twee modules van 1200 mm vormen samen een onderdeel van
      // 2400 mm. De maat van het onderdeel is dus het product, niet de modulemaat.
      const modules = after.match(/^[^0-9a-z]{0,4}(\d+)x(\d{3,5})(?![0-9a-z])/);
      if (modules) return Number(modules[1]) * Number(modules[2]);

      // "2400mm" of "2400 mm" achter het onderdeel, eventueel met een aantal
      // ervoor: in "3x 2400mm" is 2400 de maat en 3 het aantal.
      const metEenheid = after.match(/^[^0-9a-z]{0,4}(?:\d+\s*x\s*)?(\d{3,5})\s*mm\b/);
      if (metEenheid) return Number(metEenheid[1]);

      from = lower.indexOf(synonym, from + 1);
    }
  }

  return null;
}

export function tallyDocument(document: AnalysisDocument, index: number): DocumentTally {
  const mentions = new Map<string, ItemMention>();
  const occurrences = new Map<string, number>();
  const lines = new Map<string, ItemMention[]>();

  document.pages.forEach((page, pageIndex) => {
    const lines_ = page.split("\n");

    lines_.forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line) return;
      const lower = line.toLowerCase();

      for (const item of TRACKED_ITEMS) {
        if (!item.synonyms.some((word) => lower.includes(word))) continue;
        if (isExcluded(line, item)) continue;

        occurrences.set(item.key, (occurrences.get(item.key) ?? 0) + 1);

        const count = extractCount(line, item);
        const mention: ItemMention = {
          item,
          line,
          quote: buildQuote(lines_, lineIndex),
          page: pageIndex + 1,
          count,
          scope: detectScope(line),
        };

        lines.set(item.key, [...(lines.get(item.key) ?? []), mention]);

        const existing = mentions.get(item.key);

        // Een regel mét aantal is bruikbaarder dan een regel zonder.
        if (!existing || (existing.count === null && count !== null)) {
          mentions.set(item.key, mention);
        }
      }
    });
  });

  return { document, index, mentions, occurrences, lines };
}

function byRole(tallies: DocumentTally[], role: DocumentRole): DocumentTally | undefined {
  return tallies.find((tally) => tally.document.role === role);
}

type FindingSeed = Partial<RawAiFinding> &
  Pick<
    RawAiFinding,
    | "finding_type"
    | "check_area"
    | "severity"
    | "category"
    | "title"
    | "description"
    | "source_document_index"
    | "source_page"
    | "source_quote"
    | "confidence"
  >;

function finding(seed: FindingSeed): RawAiFinding {
  return {
    compared_document_index: null,
    compared_page: null,
    compared_quote: "",
    ...seed,
  };
}

// ---------------------------------------------------------------------------
// Controle 1 en 2: tekstbron tegenover tekstbron
// ---------------------------------------------------------------------------

/**
 * Bepaalt of twee aantallen überhaupt vergelijkbaar zijn.
 *
 * Een offerte noemt vaak alleen meerwerk, een stuklijst het totaal. Zonder gelijke
 * betekenis mag een verschil nooit als afwijking worden gemeld.
 */
export function comparable(
  itemKey: string,
  sourceScope: QuantityScope,
  targetScope: QuantityScope,
  options: { targetIsTotal?: boolean } = {},
): { ok: true } | { ok: false; reason: string } {
  const item = findItem(itemKey);
  const naam = item?.plural ?? itemKey;

  // 1. Beide bronnen zeggen wat ze bedoelen: dan is het eenvoudig.
  if (sourceScope !== "unknown" && targetScope !== "unknown") {
    if (sourceScope === targetScope) return { ok: true };
    return {
      ok: false,
      reason: "de ene bron noemt meerwerk en de andere een totaal",
    };
  }

  // 2. Eén bron zegt expliciet "meerwerk", de andere zwijgt erover. Dan weten we
  //    niet of de andere kant het totaal of ook alleen meerwerk telt.
  const eenKantExtra = sourceScope === "extra" || targetScope === "extra";
  if (eenKantExtra) {
    return {
      ok: false,
      reason:
        "de ene bron gaat expliciet over meerwerk, terwijl van de andere niet vaststaat of die het totaal of alleen meerwerk telt",
    };
  }

  // 3. Vergelijken met een stuklijsttotaal. Bij een onderdeel dat standaard in de
  //    unit zit telt een offerte vrijwel zeker alleen de extra's; dat is geen
  //    vergelijkbare grootheid.
  if (options.targetIsTotal && isStandardItem(itemKey)) {
    return {
      ok: false,
      reason: `${naam} zitten standaard in de unit, dus een genoemd aantal kan het meerwerk zijn in plaats van het totaal`,
    };
  }

  // 4. Twee beschrijvende bronnen over dezelfde unit, geen van beide met een
  //    meerwerk-aanduiding: die beschrijven dezelfde werkelijkheid.
  return { ok: true };
}

function compareTextSources(
  source: DocumentTally,
  target: DocumentTally,
  checkArea: "offer_vs_drawing" | "drawing_vs_bom" | "offer_vs_bom",
  sourceLabel: string,
  targetLabel: string,
  onlyMissing = false,
): RawAiFinding[] {
  const findings: RawAiFinding[] = [];

  for (const [key, mention] of source.mentions) {
    const counterpart = target.mentions.get(key);
    const naam = mention.item.plural;

    if (!counterpart) {
      findings.push(
        finding({
          finding_type: "missing",
          check_area: checkArea,
          severity: "medium",
          category: "completeness",
          title: `${mention.item.label} niet teruggevonden in de ${targetLabel}`,
          description:
            `De ${sourceLabel} noemt ${naam}, maar in de ${targetLabel} (${target.document.fileName}) is geen vermelding van ${naam} teruggevonden. ` +
            "Controleer of het onderdeel daar hoort te staan of onder een andere benaming is opgenomen.",
          source_document_index: source.index,
          source_page: mention.page,
          source_quote: mention.quote,
          confidence: "medium",
        }),
      );
      continue;
    }

    if (onlyMissing) continue;

    const bothCounted = mention.count !== null && counterpart.count !== null;

    if (bothCounted && mention.count !== counterpart.count) {
      const verdict = comparable(key, mention.scope, counterpart.scope);

      if (verdict.ok) {
        findings.push(
          finding({
            finding_type: "discrepancy",
            check_area: checkArea,
            severity: "high",
            category: "quantity",
            title: `Aantal ${naam} verschilt tussen ${sourceLabel} en ${targetLabel}`,
            description:
              `De ${sourceLabel} vermeldt ${mention.count} ${naam}, de ${targetLabel} vermeldt er ${counterpart.count}. ` +
              "Beide waarden staan letterlijk in de documenten en betreffen dezelfde grootheid; welke de juiste is, is niet uit de stukken op te maken.",
            source_document_index: source.index,
            source_page: mention.page,
            source_quote: mention.quote,
            compared_document_index: target.index,
            compared_page: counterpart.page,
            compared_quote: counterpart.quote,
            confidence: "high",
          }),
        );
      } else {
        findings.push(
          finding({
            finding_type: "attention",
            check_area: checkArea,
            severity: "low",
            category: "quantity",
            title: `Aantal ${naam} verschilt, maar is niet zonder meer vergelijkbaar`,
            description:
              `De ${sourceLabel} vermeldt ${mention.count} ${naam}, de ${targetLabel} vermeldt er ${counterpart.count}. ` +
              `Deze getallen zijn niet zonder meer met elkaar te vergelijken: ${verdict.reason}. ` +
              "Er is dus geen afwijking aangetoond; dit vraagt om beoordeling.",
            source_document_index: source.index,
            source_page: mention.page,
            source_quote: mention.quote,
            compared_document_index: target.index,
            compared_page: counterpart.page,
            compared_quote: counterpart.quote,
            confidence: "low",
          }),
        );
      }
      continue;
    }

    if (mention.count !== null && counterpart.count === null) {
      // De tegenhanger noemt het onderdeel wel, maar zonder aantal. Soms staat het
      // aantal er als herhaling: drie losse regels betekent drie stuks.
      const herhalingen = target.occurrences.get(key) ?? 0;
      const viaHerhaling = herhalingen > 1 ? ` In de ${targetLabel} komt het onderdeel op ${herhalingen} afzonderlijke regels voor, wat op ${herhalingen} stuks kan duiden.` : "";

      findings.push(
        finding({
          finding_type: "attention",
          check_area: checkArea,
          severity: "low",
          category: "quantity",
          title: `Aantal ${naam} niet vast te stellen in de ${targetLabel}`,
          description:
            `De ${sourceLabel} vermeldt ${mention.count} ${naam}. In de ${targetLabel} komen ${naam} wel voor, maar er is geen aantal uit af te leiden.${viaHerhaling} ` +
            "Er is geen tegenstrijdigheid aangetoond; dit vraagt om controle.",
          source_document_index: source.index,
          source_page: mention.page,
          source_quote: mention.quote,
          compared_document_index: target.index,
          compared_page: counterpart.page,
          compared_quote: counterpart.quote,
          confidence: "low",
        }),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Controle 2 en 3: tekstbron tegenover stuklijst
// ---------------------------------------------------------------------------

/** Zoekt de regel in de stuklijstweergave die bij een artikel hoort. */
function bomLineFor(bom: DocumentTally, articleNumber: string, description: string): {
  line: string;
  page: number;
} | null {
  const needle = articleNumber !== "-" ? articleNumber : description;

  for (let p = 0; p < bom.document.pages.length; p++) {
    for (const raw of bom.document.pages[p].split("\n")) {
      if (raw.includes(needle)) return { line: raw.trim(), page: p + 1 };
    }
  }
  return null;
}

/**
 * Vergelijkt een tekstbron met de stuklijst.
 *
 * Zonder bevestigde artikelkoppeling in brouwer-rules.ts levert dit altijd een
 * aandachtspunt op, nooit een afwijking. Dat is opzet: een offerteregel en een
 * stuklijstartikel aan elkaar knopen op basis van een woord is niet betrouwbaar.
 */
function compareWithBom(
  source: DocumentTally,
  bom: DocumentTally,
  checkArea: "drawing_vs_bom" | "offer_vs_bom",
  sourceLabel: string,
  reportOpenQuestions = false,
): RawAiFinding[] {
  const findings: RawAiFinding[] = [];
  const articles = bom.document.articles ?? [];
  const subprojectCount = bom.document.subprojectCount ?? 0;

  for (const [key, mention] of source.mentions) {
    const item = mention.item;
    const naam = item.plural;

    const link = findArticleLink(key);

    // Een vastgelegd artikelnummer wordt in de hele stuklijst gezocht, niet alleen
    // tussen de omschrijvingen die het woord bevatten. Anders zou de koppeling
    // alsnog van een tekstmatch afhangen: "Opbouwhuis 2-voudig" is de teller voor
    // de WCD zonder dat de omschrijving "WCD" bevat.
    const gekoppeld = link
      ? articles.find(
          (article) =>
            link.articleNumbers.includes(article.articleNumber) ||
            (link.descriptionContains ?? []).some((fragment) =>
              article.description.toLowerCase().includes(fragment),
            ),
        )
      : undefined;

    const alleMatching = articles.filter((article) => {
      const text = article.description.toLowerCase();
      return item.synonyms.some((word) => text.includes(word)) && !isExcluded(article.description, item);
    });

    if (!gekoppeld && alleMatching.length === 0) {
      findings.push(
        finding({
          finding_type: "missing",
          check_area: checkArea,
          severity: "medium",
          category: "completeness",
          title: `${item.label} niet teruggevonden in de stuklijst`,
          description:
            `De ${sourceLabel} noemt ${naam}, maar in de stuklijst (${bom.document.fileName}) is geen artikel gevonden waarvan de omschrijving daarnaar verwijst. ` +
            "Controleer of het onderdeel onder een andere artikelnaam is opgenomen.",
          source_document_index: source.index,
          source_page: mention.page,
          source_quote: mention.quote,
          confidence: "low",
        }),
      );
      continue;
    }

    // Ondersteunende artikelen horen bij hetzelfde onderdeel, maar zijn er geen
    // tweede exemplaar van. Ze gaan uit de kandidaten zodat ze nooit de teller
    // kunnen worden: bij een dubbele WCD staat het inbouwdeel met 10 per unit in
    // de stuklijst, terwijl er vijf dubbele WCD's zijn.
    const ondersteunend = new Set((link?.supportingArticles ?? []).map((a) => a.articleNumber));
    const matching = alleMatching.filter((article) => !ondersteunend.has(article.articleNumber));

    // Wel een bevestigde koppeling, maar het gekoppelde artikel staat niet in deze
    // stuklijst: dat is aantoonbaar iets om na te kijken.
    if (link && !gekoppeld) {
      findings.push(
        finding({
          finding_type: "missing",
          check_area: checkArea,
          severity: "medium",
          category: "completeness",
          title: `${item.label}: gekoppeld artikel niet in de stuklijst gevonden`,
          description:
            `De ${sourceLabel} noemt ${naam}. Het daarvoor vastgelegde artikel ` +
            `(${link.articleNumbers.join(", ")}) komt niet voor in deze stuklijst. ` +
            "Controleer of het onder een ander artikelnummer is opgenomen.",
          source_document_index: source.index,
          source_page: mention.page,
          source_quote: mention.quote,
          confidence: "medium",
        }),
      );
      continue;
    }

    const primary = gekoppeld ?? matching[0];
    // Alleen ondersteunende artikelen en geen koppeling: er valt niets te tellen.
    if (!primary) continue;

    const bomLine = bomLineFor(bom, primary.articleNumber, primary.description);
    if (!bomLine) continue;

    const perUnit = subprojectCount > 0 ? primary.totalAmount / subprojectCount : null;
    const aantalTekst =
      perUnit !== null
        ? `${primary.totalAmount} in totaal over ${subprojectCount} subprojecten, dat is ${Number(perUnit.toFixed(2))} per unit`
        : `${primary.totalAmount}`;

    if (!link) {
      // Alleen melden wanneer er werkelijk iets te vergelijken valt: twee bekende
      // aantallen die van elkaar verschillen. Is er aan één kant geen aantal, dan
      // is er niets aangetoond en zou een melding alleen ruis zijn. Zonder deze
      // rem levert elk herkend onderdeel een aandachtspunt op.
      if (mention.count === null || perUnit === null) continue;
      if (Math.abs(perUnit - mention.count) < 0.001) continue;

      // Geen bevestigde koppeling: benoemen wat we zien, niets concluderen.
      const meerdere =
        matching.length > 1
          ? ` Er zijn ${matching.length} artikelen waarvan de omschrijving naar ${naam} verwijst, dus welke regel erbij hoort is niet eenduidig.`
          : "";

      findings.push(
        finding({
          finding_type: "attention",
          check_area: checkArea,
          severity: "low",
          category: "quantity",
          title: `${item.label}: koppeling met de stuklijst niet bevestigd`,
          description:
            `De ${sourceLabel} noemt ${naam}${mention.count !== null ? ` (${mention.count})` : ""}. ` +
            `In de stuklijst staat artikel ${primary.articleNumber}: ${aantalTekst}.${meerdere} ` +
            "Of deze regels hetzelfde onderdeel betreffen, en of het om een totaal of om meerwerk gaat, is niet uit de documenten af te leiden. " +
            "Zolang die koppeling niet is vastgelegd, wordt hier geen afwijking uit afgeleid.",
          source_document_index: source.index,
          source_page: mention.page,
          source_quote: mention.quote,
          compared_document_index: bom.index,
          compared_page: bomLine.page,
          compared_quote: bomLine.line,
          confidence: "low",
        }),
      );
      continue;
    }

    // Punten die met de koppeling niet zijn opgelost, blijven zichtbaar - ook als
    // de aantallen kloppen. Anders verdwijnt zo'n punt juist op het moment dat de
    // koppeling wordt vastgelegd.
    if (reportOpenQuestions && (link.openQuestions?.length ?? 0) > 0) {
      findings.push(
        finding({
          finding_type: "attention",
          check_area: checkArea,
          severity: "medium",
          category: "consistency",
          title: `${item.label}: koppeling bevestigd, aandachtspunt blijft open`,
          description:
            `De koppeling naar artikel ${primary.articleNumber} is vastgelegd, maar daarmee is het volgende niet opgelost. ` +
            (link.openQuestions ?? []).join(" "),
          source_document_index: source.index,
          source_page: mention.page,
          source_quote: mention.quote,
          compared_document_index: bom.index,
          compared_page: bomLine.page,
          compared_quote: bomLine.line,
          confidence: "medium",
        }),
      );
    }

    // Vergelijken mag, mits de betekenis van beide aantallen gelijk is.
    if (perUnit === null) continue;

    const conversies = link.sizeConversions ?? [];
    let verwacht: number;
    let maatUitleg = "";
    // Kunnen we het aantal in de unit volledig herleiden, of alleen gedeeltelijk?
    let volledig = true;

    if (conversies.length > 0) {
      // Onderdelen die uit modules bestaan worden per regel omgerekend en daarna
      // opgeteld. Een tekening beschrijft twee banken op twee regels; samen zijn
      // dat de banken in de unit. Een aantal uit een enkele regel zou hier juist
      // een verkeerd beeld geven.
      const regels = source.lines.get(key) ?? [mention];
      const maten = conversies.map((c) => `${c.sizeMm} mm`).join(" of ");
      const delen: string[] = [];
      const onbekendeMaten: number[] = [];
      let zonderMaat = 0;
      let totaal = 0;

      for (const regel of regels) {
        const maat = extractSizeMm(regel.line, item);
        if (maat === null) {
          zonderMaat += 1;
          continue;
        }

        const conversie = conversies.find((c) => c.sizeMm === maat);
        if (!conversie) {
          onbekendeMaten.push(maat);
          continue;
        }

        // Zonder expliciet aantal beschrijft een regel één onderdeel. "(2x1200)"
        // levert hier geen aantal op: dat is de samenstelling, niet de telling.
        const aantal = regel.count ?? 1;
        totaal += aantal * conversie.articlesPerItem;
        delen.push(
          `${aantal} x ${maat} mm = ${aantal * conversie.articlesPerItem} stuks`,
        );
      }

      if (delen.length === 0) {
        const onbekend = onbekendeMaten.length > 0;
        findings.push(
          finding({
            finding_type: "attention",
            check_area: checkArea,
            severity: "low",
            category: "quantity",
            title: onbekend
              ? `${item.label}: maat ${onbekendeMaten[0]} mm is niet vastgelegd`
              : `${item.label}: maat ontbreekt, aantal niet te herleiden`,
            description: onbekend
              ? `De ${sourceLabel} noemt ${naam} van ${onbekendeMaten[0]} mm. Voor dit onderdeel is alleen vastgelegd ` +
                `hoeveel stuks van artikel ${primary.articleNumber} bij ${maten} horen. ` +
                "Zolang deze maat niet is vastgelegd, wordt er geen aantal uit afgeleid."
              : `De ${sourceLabel} noemt ${naam}, maar zonder maat. ` +
                `Hoeveel stuklijstartikelen daarbij horen hangt bij dit onderdeel van de maat af (${maten}), ` +
                `dus tegenover artikel ${primary.articleNumber} (${aantalTekst}) valt hier niets vast te stellen.`,
            source_document_index: source.index,
            source_page: mention.page,
            source_quote: mention.quote,
            compared_document_index: bom.index,
            compared_page: bomLine.page,
            compared_quote: bomLine.line,
            confidence: "low",
          }),
        );
        continue;
      }

      verwacht = totaal;
      volledig = zonderMaat === 0 && onbekendeMaten.length === 0;

      const overgeslagen = zonderMaat + onbekendeMaten.length;
      maatUitleg =
        ` Uit de ${sourceLabel} volgt: ${delen.join(", ")}; samen ${totaal} x artikel ${primary.articleNumber}.` +
        (overgeslagen > 0
          ? ` Daarnaast staan er ${overgeslagen} regels over ${naam} zonder herkende maat (${maten}); die zijn niet meegeteld.`
          : "");
    } else {
      if (mention.count === null) continue;
      verwacht = mention.count;
    }

    const steunend = link.supportingArticles ?? [];
    const ondersteunendTekst =
      steunend.length > 0
        ? " Niet apart geteld, omdat ze bij hetzelfde onderdeel horen: " +
          steunend.map((a) => `${a.articleNumber} (${a.role})`).join("; ") +
          "."
        : "";

    const verdict = comparable(key, mention.scope, link.countsAs, {
      targetIsTotal: link.countsAs === "total",
    });
    const verschilt = Math.abs(perUnit - verwacht) > 0.001;
    if (!verschilt) continue;

    // Een afwijking hoort alleen hard te zijn wanneer het aantal in de bron
    // volledig te herleiden is. Is een deel van de regels overgeslagen, dan is
    // `verwacht` een ondergrens en zegt een verschil op zichzelf niets.
    const hard = verdict.ok && volledig;

    findings.push(
      finding({
        finding_type: hard ? "discrepancy" : "attention",
        check_area: checkArea,
        severity: hard ? "high" : "low",
        category: "quantity",
        title: hard
          ? `Aantal ${naam} verschilt tussen ${sourceLabel} en stuklijst`
          : `Aantal ${naam} verschilt, maar is niet zonder meer vergelijkbaar`,
        description:
          (conversies.length > 0
            ? `De ${sourceLabel} beschrijft ${naam}.${maatUitleg} `
            : `De ${sourceLabel} vermeldt ${mention.count} ${naam}. `) +
          `De stuklijst geeft voor artikel ${primary.articleNumber} ${aantalTekst}. ` +
          (hard
            ? `Beide betreffen ${link.countsAs === "extra" ? "meerwerk" : "het totaal"}.`
            : verdict.ok
              ? "Niet alle regels konden worden omgerekend, dus dit aantal is een ondergrens."
              : `Deze getallen zijn niet zonder meer vergelijkbaar: ${verdict.reason}.`) +
          ondersteunendTekst +
          (link.note ? ` ${link.note}` : ""),
        source_document_index: source.index,
        source_page: mention.page,
        source_quote: mention.quote,
        compared_document_index: bom.index,
        compared_page: bomLine.page,
        compared_quote: bomLine.line,
        confidence: hard ? "medium" : "low",
      }),
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Controle 4: maatvoering
// ---------------------------------------------------------------------------

function checkDimensions(tallies: DocumentTally[]): RawAiFinding[] {
  const findings: RawAiFinding[] = [];

  for (const tally of tallies) {
    if (tally.document.role !== "drawing" && tally.document.role !== "specification") continue;

    for (const rule of REQUIRED_DIMENSION_RULES) {
      const mention = tally.mentions.get(rule.item);
      if (!mention) continue;

      const pageText = (tally.document.pages[mention.page - 1] ?? "").toLowerCase();

      for (const kind of rule.required) {
        const keywords = DIMENSION_KEYWORDS[kind];
        const heeftMaat =
          keywords.some((word) => pageText.includes(word)) || MEASUREMENT_PATTERN.test(mention.line);
        if (heeftMaat) continue;

        // enforced is nu overal false: het ontbreken van een maat is een
        // aandachtspunt zolang Brouwer niet heeft bevestigd dat de maat verplicht is.
        findings.push(
          finding({
            finding_type: rule.enforced ? "missing" : "attention",
            check_area: "dimensions",
            severity: rule.enforced ? "medium" : "low",
            category: "production",
            title: `${mention.item.label}: geen ${DIMENSION_LABELS[kind]} aangegeven`,
            description:
              `Op de tekening staat een ${mention.item.label}, maar op deze pagina is geen ${DIMENSION_LABELS[kind]} terug te vinden. ` +
              (rule.enforced
                ? "Deze maat is als verplicht vastgelegd."
                : "Welke maat juist is blijkt niet uit de stukken, en er is niet vastgelegd dat deze maat verplicht is; dit is daarom een aandachtspunt.") +
              (rule.note ? ` ${rule.note}` : ""),
            source_document_index: tally.index,
            source_page: mention.page,
            source_quote: mention.quote,
            confidence: "medium",
          }),
        );
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Controle 5: locatie
// ---------------------------------------------------------------------------

function checkLocations(tallies: DocumentTally[]): RawAiFinding[] {
  const findings: RawAiFinding[] = [];
  const drawing = byRole(tallies, "drawing");

  for (const tally of tallies) {
    if (tally.document.role !== "offer" && tally.document.role !== "drawing") continue;

    for (const key of LOCATION_REQUIRED_ITEMS) {
      const mention = tally.mentions.get(key);
      if (!mention) continue;

      const lineText = mention.line.toLowerCase();
      const opRegel = LOCATION_KEYWORDS.some((word) => lineText.includes(word));

      // Ook de tekening mag de locatie leveren, mits het onderdeel daar met een
      // locatiewoord op dezelfde regel staat.
      let opTekening: { quote: string; page: number } | null = null;
      if (!opRegel && drawing && drawing !== tally) {
        const tekeningMention = drawing.mentions.get(key);
        if (tekeningMention) {
          const t = tekeningMention.line.toLowerCase();
          if (LOCATION_KEYWORDS.some((word) => t.includes(word))) {
            opTekening = { quote: tekeningMention.quote, page: tekeningMention.page };
          }
        }
      }

      if (opRegel || opTekening) continue;

      const heeftTekening = drawing !== undefined;
      findings.push(
        finding({
          finding_type: heeftTekening ? "missing" : "attention",
          check_area: "location",
          severity: heeftTekening ? "medium" : "low",
          category: "completeness",
          title: `${mention.item.label}: geen locatie-aanduiding gevonden`,
          description:
            `${mention.item.label} wordt genoemd, maar er is geen aanduiding gevonden waaruit blijkt wáár het onderdeel komt. ` +
            (heeftTekening
              ? "Ook op de tekening is bij dit onderdeel geen locatie-aanwijzing teruggevonden."
              : "Er is geen tekening aangeleverd om de locatie op te controleren."),
          source_document_index: tally.index,
          source_page: mention.page,
          source_quote: mention.quote,
          confidence: "low",
        }),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Orchestratie
// ---------------------------------------------------------------------------

export function analyseDocuments(documents: AnalysisDocument[]): RawAiFinding[] {
  const tallies = documents.map((document, index) => tallyDocument(document, index + 1));

  const offer = byRole(tallies, "offer");
  const drawing = byRole(tallies, "drawing");
  const bom = byRole(tallies, "bill_of_materials");

  const findings: RawAiFinding[] = [];

  if (offer && drawing) {
    findings.push(...compareTextSources(offer, drawing, "offer_vs_drawing", "offerte", "tekening"));
  }

  if (bom) {
    // Een stuklijst uit een xlsx-export heeft artikelregels; die vergelijken we op
    // artikelniveau. Is de stuklijst als PDF aangeleverd, dan is er geen
    // artikelstructuur en vergelijken we op tekst, net als bij de tekening.
    const gestructureerd = (bom.document.articles?.length ?? 0) > 0;

    if (drawing) {
      findings.push(
        ...(gestructureerd
          ? compareWithBom(drawing, bom, "drawing_vs_bom", "tekening", !offer)
          : compareTextSources(drawing, bom, "drawing_vs_bom", "tekening", "stuklijst")),
      );
      if (!gestructureerd) {
        findings.push(
          ...compareTextSources(bom, drawing, "drawing_vs_bom", "stuklijst", "tekening", true),
        );
      }
    }

    if (offer) {
      findings.push(
        ...(gestructureerd
          ? compareWithBom(offer, bom, "offer_vs_bom", "offerte", true)
          : compareTextSources(offer, bom, "offer_vs_bom", "offerte", "stuklijst")),
      );
    }
  }

  findings.push(...checkDimensions(tallies));
  findings.push(...checkLocations(tallies));

  return dedupe(findings);
}

/** Dezelfde constatering kan uit twee richtingen komen; houd er één over. */
function dedupe(findings: RawAiFinding[]): RawAiFinding[] {
  const seen = new Set<string>();
  const result: RawAiFinding[] = [];

  for (const item of findings) {
    const key = `${item.check_area}|${item.title}|${item.source_document_index}|${item.source_quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}
