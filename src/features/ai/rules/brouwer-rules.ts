/**
 * ============================================================================
 * NOG TE VALIDEREN DOOR BROUWER
 * ============================================================================
 *
 * Dit bestand is configuratie, geen vastgestelde bedrijfsregel. Alles hieronder is
 * een eerste aanzet, opgesteld op basis van gesprekken met de werkvoorbereiding en
 * op waarnemingen in dossier P251411. Het moet door Brouwer worden nagelopen
 * voordat er conclusies aan verbonden worden.
 *
 * Twee harde uitgangspunten voor de hele applicatie:
 *
 * 1. Deze regels zeggen uitsluitend WELKE informatie aanwezig moet zijn, nooit
 *    WELKE WAARDE die zou moeten hebben. "Een legplank heeft een hoogtemaat nodig"
 *    mag hier staan. "Een legplank hoort op 1200 mm te zitten" nooit.
 *
 * 2. Er wordt nooit een verband tussen twee bronnen aangenomen. Een offerteregel
 *    wordt alleen aan een stuklijstartikel gekoppeld als dat hieronder expliciet is
 *    vastgelegd. Zonder koppeling levert een verschil hooguit een aandachtspunt op.
 */

// ---------------------------------------------------------------------------
// Onderdelen en schrijfwijzen
// ---------------------------------------------------------------------------

export type ItemDefinition = {
  key: string;
  label: string;
  plural: string;
  /** Schrijfwijzen die in documenten voorkomen, in kleine letters. */
  synonyms: string[];
  /**
   * Woorden die een treffer juist ongeldig maken. Bedoeld tegen vals-positieven:
   * "stormketting op de buitendeur" gaat over een accessoire, niet over een deur.
   *
   * NOG TE VALIDEREN: deze lijsten komen uit waarnemingen op één dossier.
   */
  excludeIfLineContains?: string[];
};

export const TRACKED_ITEMS: ItemDefinition[] = [
  {
    key: "plafondarmatuur",
    label: "plafondarmatuur",
    plural: "plafondarmaturen",
    synonyms: ["plafondarmatuur", "plafondarmaturen", "plafonniere", "plafonnière", "armatuur", "armaturen"],
  },
  {
    key: "led_strip",
    label: "LED-strip",
    plural: "LED-strips",
    synonyms: ["led-strip", "led strip", "ledstrip", "led-strips", "led strips", "ledstrips"],
    excludeIfLineContains: ["transformator", "trafo los", "profiel"],
  },
  {
    key: "wcd",
    label: "WCD",
    plural: "WCD's",
    synonyms: ["wcd", "wandcontactdoos", "wandcontactdozen", "stopcontact", "stopcontacten"],
  },
  {
    key: "lichtschakelaar",
    label: "lichtschakelaar",
    plural: "lichtschakelaars",
    synonyms: ["lichtschakelaar", "lichtschakelaars", "schakelaar", "schakelaars"],
    excludeIfLineContains: ["groepenkast", "hoofdschakelaar"],
  },
  {
    key: "legplank",
    label: "legplank",
    plural: "legplanken",
    // "plank" alleen is te breed gebleken (wandplank, vloerplank); bewust weggelaten.
    synonyms: ["legplank", "legplanken"],
  },
  {
    key: "tafel",
    label: "tafel",
    plural: "tafels",
    synonyms: ["tafel", "tafels"],
    // "boven tafel" is een locatie-aanduiding van iets anders, geen tafelregel.
    excludeIfLineContains: ["boven tafel", "boven de tafel", "onder tafel"],
  },
  {
    key: "bank",
    label: "bank",
    plural: "banken",
    synonyms: ["bank", "banken"],
    // "rugleuning" stond hier eerder ook in en sloot daardoor artikel 11810018
    // "Opbergbank met rugleuning (breedte bank)" uit - juist de bank zelf. De
    // losse rugleuning wordt nog steeds afgevangen: de offerteregel via
    // "t.b.v. bank", en het stuklijstartikel "Skairugleuning" bevat geen enkel
    // bank-synoniem en matcht dus sowieso niet.
    excludeIfLineContains: ["bankdeksel", "t.b.v. bank", "werkbank"],
  },
  {
    key: "deur",
    label: "deur",
    plural: "deuren",
    synonyms: ["deur", "deuren"],
    excludeIfLineContains: [
      "op de deur",
      "op de buitendeur",
      // Zonder lidwoord komt ook voor: "Pictogrambord gemonteerd op buitendeur
      // magazijnruimte" gaat over het bord, niet over een deur.
      "op buitendeur",
      "deurvastzetter",
      "deurdranger",
      "deurkruk",
      "naast deur",
      "naast de deur",
      "toegangsdeur",
    ],
  },
  {
    key: "raam",
    label: "raam",
    plural: "ramen",
    synonyms: ["raam", "ramen", "schuifraam"],
    excludeIfLineContains: ["t.b.v. schuifraam", "meerprijs isoglas", "glas t.b.v."],
  },
];

/**
 * Tekens die de OCR-laag van een gescande offerte oplevert in plaats van een
 * gewone letter. In P251411 werd "buitendeur" gelezen als "bu¡tendeur", waardoor
 * het uitsluitwoord "op de buitendeur" niet aansloeg en een secustrip-regel als
 * deurregel werd geteld.
 *
 * Bewust een korte, expliciete lijst: alleen tekens die visueel een i zijn. Geen
 * brede normalisatie (geen accenten strippen, geen l/I/1-verwarring), want die
 * raakt gewone Nederlandse woorden en zou uitsluitwoorden onbedoeld laten aanslaan.
 *
 * Wordt uitsluitend gebruikt om woorden te herkennen, nooit voor citaten: een
 * citaat blijft altijd letterlijk de brontekst.
 */
const OCR_LETTER_SUBSTITUTES: Record<string, string> = {
  "¡": "i", // omgekeerd uitroepteken
  "¦": "i", // gebroken streep
  "í": "i", // i-acuut
  "ì": "i", // i-grave
  "î": "i", // i-circumflex
  "ï": "i", // i-trema
  "ı": "i", // i zonder punt
};

export function normaliseOcrLetters(text: string): string {
  let result = "";
  for (const teken of text) result += OCR_LETTER_SUBSTITUTES[teken] ?? teken;
  return result;
}

export function findItem(key: string): ItemDefinition | undefined {
  return TRACKED_ITEMS.find((item) => item.key === key);
}

// ---------------------------------------------------------------------------
// Standaard tegenover optioneel, en wat een aantal betekent
// ---------------------------------------------------------------------------

/**
 * Wat een aantal in een bron betekent. Dit is de belangrijkste toevoeging: zonder
 * dit onderscheid worden getallen vergeleken die niet vergelijkbaar zijn.
 *
 * - total   : het totale aantal in de unit (typisch de stuklijst)
 * - extra   : alleen meerwerk boven de standaarduitvoering (typisch de offerte)
 * - unknown : niet vast te stellen
 */
export type QuantityScope = "total" | "extra" | "unknown";

/**
 * Woorden die aangeven dat een regel over meerwerk gaat en dus NIET het totaal is.
 * NOG TE VALIDEREN: aangevuld op basis van de opdrachtbevestiging van P251411.
 */
export const EXTRA_MARKERS: string[] = [
  "extra",
  "meerprijs",
  "meerwerk",
  "optie",
  "opties",
  "toeslag",
  "bijgeleverd",
  "aanvullend",
];

/** Woorden die aangeven dat het juist om de standaarduitvoering gaat. */
export const STANDARD_MARKERS: string[] = ["standaard", "basis", "inbegrepen", "standaarduitvoering"];

/**
 * Gescande offertes hebben een OCR-tekstlaag met tekenfouten. In P251411 werd
 * "Extra" gelezen als "E)Ira": zelfde lengte, zelfde beginletter, twee posities
 * verminkt tot niet-letters. Daardoor faalde de meerwerkdetectie precies op de
 * regel waar die het hardst nodig was.
 *
 * Deze vergelijking is bewust smal gehouden om gewone woorden niet te raken:
 * gelijke lengte, gelijke eerste letter, hooguit twee afwijkende posities, en
 * minstens een van die afwijkingen moet geen gewone letter zijn. Dat laatste is
 * het kenmerk van een OCR-fout; een ander Nederlands woord voldoet er niet aan.
 *
 * Wordt uitsluitend gebruikt om meerwerk te herkennen, nooit voor citaten.
 */
export function looksLikeMarker(word: string, marker: string): boolean {
  if (word.length !== marker.length || marker.length < 4) return false;
  if (word[0] !== marker[0]) return false;

  let afwijkend = 0;
  let ocrTeken = false;

  for (let i = 0; i < marker.length; i += 1) {
    if (word[i] === marker[i]) continue;
    afwijkend += 1;
    if (afwijkend > 2) return false;
    if (!/[a-z]/.test(word[i])) ocrTeken = true;
  }

  return afwijkend > 0 && ocrTeken;
}

function bevatMarker(line: string, markers: string[]): boolean {
  const lower = line.toLowerCase();
  if (markers.some((word) => lower.includes(word))) return true;

  // Pas als letterlijk zoeken niets oplevert, kijken we of een woord een
  // OCR-verminkte versie van een marker is.
  const woorden = lower.split(/[^\p{L})(\[\]{}|\\/]+/u).filter(Boolean);
  return woorden.some((woord) => markers.some((marker) => looksLikeMarker(woord, marker)));
}

export function detectScope(line: string): QuantityScope {
  if (bevatMarker(line, EXTRA_MARKERS)) return "extra";
  if (bevatMarker(line, STANDARD_MARKERS)) return "total";
  return "unknown";
}

/**
 * Onderdelen waarvan bekend is dat ze standaard in elke unit zitten. Voor die
 * onderdelen geldt: een offerteregel telt vrijwel zeker alleen het meerwerk, en
 * mag dus niet tegen een stuklijsttotaal worden gelegd.
 *
 * NOG TE VALIDEREN DOOR BROUWER — dit is de lijst waar het snelst iets misgaat.
 */
export const STANDARD_ITEMS: string[] = ["wcd", "lichtschakelaar", "plafondarmatuur", "deur"];
// BEVESTIGD DOOR BROUWER (P251411): raam hoort hier NIET in. De offerte voert het
// schuifraam op als "Meerprijs 2x Kunststofschuifraam", dus het is geen
// standaarduitvoering. Daardoor kan een bevestigde koppeling naar 11630145-S
// werkelijk tot een afwijking leiden in plaats van tot een aandachtspunt.

/** Onderdelen die uitsluitend als optie voorkomen. NOG TE VALIDEREN. */
export const OPTIONAL_ITEMS: string[] = ["led_strip"];

export function isStandardItem(key: string): boolean {
  return STANDARD_ITEMS.includes(key);
}

// ---------------------------------------------------------------------------
// Koppeling offerte/tekening naar stuklijstartikelen
// ---------------------------------------------------------------------------

/**
 * Een artikel dat bij het onderdeel hoort maar het NIET telt.
 *
 * Zonder dit onderscheid kiest de applicatie het artikel met de meeste treffers of
 * het hoogste aantal, en dat is zelden de functionele teller. Bij een dubbele WCD
 * zitten drie artikelen in de stuklijst; maar één ervan zegt hoeveel dubbele WCD's
 * er zijn. De andere twee zijn ondersteunend.
 */
export type SupportingArticle = {
  articleNumber: string;
  /** Waarom dit artikel niet meetelt. Verschijnt in de toelichting bij een constatering. */
  role: string;
};

/**
 * Maatafhankelijke omrekening van onderdeel naar stuklijstartikelen.
 *
 * Sommige onderdelen bestaan uit modules. Een bank van 1200 mm is één module, een
 * bank van 2400 mm zijn er twee. De verhouding is dus GEEN vaste constante van het
 * onderdeel, maar volgt uit de maat die in de bron staat. Daarom wordt de maat uit
 * de brontekst gehaald en hier opgezocht; staat de maat er niet bij, dan wordt er
 * niet omgerekend en dus ook niets vergeleken.
 */
export type SizeConversion = {
  /** De maat zoals die in offerte of tekening staat, in millimeters. */
  sizeMm: number;
  /** Hoeveel stuks van het gekoppelde artikel bij één onderdeel van deze maat horen. */
  articlesPerItem: number;
};

/**
 * Welke stuklijstartikelen bij welk onderdeel horen.
 *
 * LEEG LATEN IS VEILIG. Zolang hier niets staat, koppelt de applicatie een
 * offerteregel nooit hard aan een artikel en blijft elke constatering een
 * aandachtspunt. Vul dit uitsluitend met door Brouwer bevestigde artikelnummers.
 *
 * `articleNumbers` is de functionele teller: het artikel dat zegt hoeveel van het
 * onderdeel er zijn. `countsAs` legt vast of dat aantal het totaal in de unit is of
 * alleen meerwerk.
 */
export type ArticleLink = {
  item: string;
  /** De functionele teller. Uitsluitend dit artikel bepaalt het aantal. */
  articleNumbers: string[];
  /** Omschrijvingsfragmenten die ook als koppeling gelden, in kleine letters. */
  descriptionContains?: string[];
  countsAs: QuantityScope;
  /** Toelichting voor de werkvoorbereider, verschijnt in de bevinding. */
  note?: string;
  /** Artikelen die bij het onderdeel horen maar er geen tweede exemplaar van zijn. */
  supportingArticles?: SupportingArticle[];
  /** Maatafhankelijke omrekening. Aanwezig betekent: zonder maat geen vergelijking. */
  sizeConversions?: SizeConversion[];
  /**
   * Inhoudelijke punten die met deze koppeling NIET zijn opgelost en die de
   * werkvoorbereider moet blijven zien, ook als de aantallen kloppen.
   */
  openQuestions?: string[];
};

export const ARTICLE_LINKS: ArticleLink[] = [
  {
    // BEVESTIGD DOOR BROUWER (P251411).
    item: "led_strip",
    articleNumbers: ["900006878"],
    countsAs: "total",
    // Profiel (900006188) en trafo (900002235) zijn bewust NIET gekoppeld, ook niet
    // als ondersteunend artikel: of ze onlosmakelijk bij de strip horen is nog niet
    // vastgesteld. Ze worden al door excludeIfLineContains buiten de match gehouden.
    openQuestions: [
      "Offerte en tekening vermelden IP68, terwijl artikel 900006878 IP20 is. " +
        "Dat verschil is met deze koppeling niet opgelost en vraagt een eigen beoordeling.",
    ],
  },
  {
    // BEVESTIGD DOOR BROUWER (P251411).
    item: "raam",
    articleNumbers: ["11630145-S"],
    countsAs: "total",
    note: "Afdekraam 2-voudig (12620093) is elektra-materiaal, geen raam.",
  },
  {
    // BEVESTIGD DOOR BROUWER (P251411): het tafelblad is de functionele teller.
    item: "tafel",
    articleNumbers: ["11800291"],
    countsAs: "total",
    supportingArticles: [
      {
        articleNumber: "11890042",
        role: "tafelpootvoet, ondersteunend onderdeel van dezelfde tafel",
      },
    ],
    note: "Het tafelblad telt de tafel; de pootvoeten tellen niet als tweede tafel.",
  },
  {
    // BEVESTIGD DOOR BROUWER (P251411): een dubbele WCD telt als één WCD, en het
    // artikel dat dat aantal geeft is het opbouwhuis 2-voudig (5 per unit). Het
    // inbouwdeel 12620094 staat er met 10 per unit in - twee inbouwdelen per
    // dubbele WCD - en zou zonder deze modellering de teller worden.
    item: "wcd",
    articleNumbers: ["12620096"],
    countsAs: "total",
    supportingArticles: [
      {
        articleNumber: "12620094",
        role: "WCD 1-voudig inbouwdeel, twee stuks per dubbele WCD",
      },
      {
        articleNumber: "12620093",
        role: "afdekraam 2-voudig, afwerking van dezelfde dubbele WCD",
      },
    ],
    note: "Eén dubbele WCD telt als één WCD; het opbouwhuis 2-voudig geeft dat aantal.",
  },
  {
    // BEVESTIGD DOOR BROUWER (P251411): een bank is opgebouwd uit modules van
    // 1200 mm. Een bank van 1200 mm is er een, een bank van 2400 mm zijn er twee.
    // Dit is uitdrukkelijk GEEN vaste verhouding 1:2 - die geldt alleen bij 2400 mm.
    item: "bank",
    articleNumbers: ["11810018"],
    countsAs: "total",
    sizeConversions: [
      { sizeMm: 1200, articlesPerItem: 1 },
      { sizeMm: 2400, articlesPerItem: 2 },
    ],
    supportingArticles: [
      {
        articleNumber: "11440055-S",
        role: "bankdeksel 1200 mm, afwerking van dezelfde bank",
      },
    ],
    note: "Het aantal volgt uit de maat in de bron; zonder maat wordt er niet vergeleken.",
  },

  // BEWUST NIET GEKOPPELD, ook al lijken ze te passen:
  //
  // - deur: de stuklijst bevat alleen profielen, beslag en een deurbuffer, geen
  //   artikel dat de deur zelf is. Brouwer heeft koppeling uitgesloten.
  // - legplank: drie verschillende legplankartikelen; welke bij welke
  //   tekeningregel hoort is niet vastgesteld. Brouwer heeft koppeling uitgesloten.
];

export function findArticleLink(item: string): ArticleLink | undefined {
  return ARTICLE_LINKS.find((link) => link.item === item);
}

// ---------------------------------------------------------------------------
// Maatvoering
// ---------------------------------------------------------------------------

export type DimensionKind = "height" | "position" | "length";

/**
 * Welke maatvoering aanwezig moet zijn per onderdeel.
 *
 * `enforced: false` betekent: het ontbreken levert een aandachtspunt op, nooit een
 * afwijking. Zet `enforced: true` pas wanneer Brouwer heeft bevestigd dat de maat
 * werkelijk verplicht is; dan mag het zwaarder wegen.
 */
export type DimensionRule = {
  item: string;
  required: DimensionKind[];
  enforced: boolean;
  note?: string;
};

export const REQUIRED_DIMENSION_RULES: DimensionRule[] = [
  {
    item: "legplank",
    required: ["height"],
    enforced: false,
    note: "Zonder hoogte kan de plaatsing niet worden bepaald.",
  },
  {
    item: "led_strip",
    required: ["length"],
    enforced: false,
    note: "Lengte bepaalt welk profiel en welke trafo nodig zijn.",
  },
];

export const DIMENSION_KEYWORDS: Record<DimensionKind, string[]> = {
  height: ["hoogte", "h=", "h ="],
  position: ["positie", "afstand", "hart", "h.o.h."],
  length: ["lengte", "lang", "l=", "l ="],
};

export const DIMENSION_LABELS: Record<DimensionKind, string> = {
  height: "hoogte",
  position: "positie",
  length: "lengte",
};

/** Een getal gevolgd door een eenheid telt als maatvoering. */
export const MEASUREMENT_PATTERN = /\d+\s*(mm|cm|m)\b/i;

// ---------------------------------------------------------------------------
// Locatie
// ---------------------------------------------------------------------------

/**
 * Onderdelen waarvoor de locatie uit de documenten moet blijken.
 *
 * De applicatie bepaalt nooit zelf wat de juiste locatie is; ze controleert alleen
 * of er iets over de plaats gezegd wordt. NOG TE VALIDEREN DOOR BROUWER.
 */
export const LOCATION_REQUIRED_ITEMS: string[] = [
  "led_strip",
  "lichtschakelaar",
  "wcd",
  "plafondarmatuur",
  "legplank",
];

export const LOCATION_KEYWORDS: string[] = [
  "locatie",
  "positie",
  "wand",
  "muur",
  "plafond",
  "vloer",
  "boven",
  "onder",
  "naast",
  "links",
  "rechts",
  "midden",
  "achterwand",
  "zijwand",
  "hoek",
  "berging",
  "schaftruimte",
  "kleedruimte",
  "toiletruimte",
  "magazijnruimte",
  "ruimte",
  "kast",
  "hart",
  "h.o.h.",
];

// ---------------------------------------------------------------------------
// Overzicht voor de interface
// ---------------------------------------------------------------------------

/** Samenvatting van wat er nog gevalideerd moet worden, voor weergave in de app. */
/**
 * `validated` blijft false zolang niet alle regelgroepen zijn nagelopen. Na de
 * validatie van P251411 zijn de artikelkoppelingen voor vijf onderdelen bevestigd
 * en is vastgesteld dat raam geen standaardonderdeel is, maar de maatvoering en de
 * locatievereisten zijn nog niet vastgesteld. Eén globale vlag kan dat verschil
 * niet uitdrukken; hij op true zetten zou suggereren dat ook die regels bevestigd
 * zijn. Daarom blijft hij false en staat hieronder wat er nog open is.
 */
export const VALIDATION_STATUS = {
  validated: false,
  openItems: [
    "Welke onderdelen gevolgd moeten worden en onder welke schrijfwijzen",
    "Of plafondarmatuur en lichtschakelaar terecht als standaardonderdeel gelden",
    "Welk stuklijstartikel bij deur en legplank hoort (koppeling nu uitgesloten)",
    "Welke maatvoering werkelijk verplicht is (alle regels staan nu op enforced: false)",
    "Voor welke onderdelen een locatie-aanduiding vereist is",
  ],
  /** Wat Brouwer wel heeft bevestigd, zodat zichtbaar is wat er al vaststaat. */
  confirmedItems: [
    "Artikelkoppeling voor LED-strip, raam, tafel, WCD en bank (dossier P251411)",
    "Raam is geen standaardonderdeel: de offerte voert het op als meerprijs",
  ],
} as const;
