import { SupportedLanguage } from "../types/language";

export const DEFAULT_REFUSAL_TEXT =
  "Sorry, I cannot answer that question. Please wait for the eNavigator to assist you.";

export const languageAliases: Record<SupportedLanguage, string[]> = {
  english: ["english", "en"],
  filipino: ["filipino", "tagalog"],
  bisaya: ["bisaya", "cebuano"],
  hiligaynon: ["hiligaynon", "ilonggo"],
};
export const tagalogMarkers = [
  "ako",
  "ikaw",
  "siya",
  "kami",
  "kayo",
  "sila",
  "ang",
  "ng",
  "nang",
  "mga",
  "ba",
  "na",
  "pa",
  "rin",
  "din",
  "lang",
  "pero",
  "kasi",
  "dahil",
  "habang",
  "kung",
  "pwede",
  "bawal",
  "paano",
  "bakit",
  "saan",
  "kailan",
  "magkano",
  "ilan",
  "ano",
  "oo",
  "hindi",
  "wala",
  "meron",
  "may",
  "gusto",
  "ayaw",
  "kumain",
  "pagkain",
  "gamot",
  "bawal",
  "pwede",
  "dapat",
  "pwedeng",
  "pumunta",
  "maganda",
  "masama",
  "malaki",
  "maliit",
  "matamis",
  "maalat",
  "maasim",
  "maanghang",
  "malusog",
  "sakit",
  "gamot",
  "doktor",
  "pasyente",
  "asawa",
  "anak",
  "magulang",
  "kaibigan",
  "trabaho",
  "bahay",
  "araw",
  "gabi",
  "oras",
  "minuto",
  "taon",
  "buwan",
  "linggo",
  "umaga",
  "hapon",
  "gabi",
  "ngayon",
  "bukas",
  "kahapon",
  "kanina",
  "mamaya",
  "dito",
  "doon",
  "iyan",
  "iyan",
  "ito",
  "iyan",
  "iyan",
  "iyan",
];
export const hiligaynonMarkers = [
  // Tagalog/Filipino markers for detection
  // Common Hiligaynon words and particles
  "ano",
  "dapat",
  "nga",
  "sng",
  "ko",
  "imo",
  "pamangkot",
  "hulat",
  "mabuligan",
  "wala",
  "ini",
  "kay",
  "para",
  "sa",
  "indi",
  "gid",
  "subong",
  "palihog",
  "akon",
  "kag",
  "gani",
  "basi",
  "gina",
  "sang",
  "pwede",
  "man",
  "lang",
  "daw",
  "bala",
  "ti",
  "gani",
  "tani",
  "ayhan",
  "na",
  "pa",
  "siya",
  "ikaw",
  "kami",
  "kita",
  "sila",
  "ni",
  "mo",
  "ka",
  "si",
  "ang",
  "may",
  "wala",
  "bal-an",
  "gusto",
  "masabat",
  "pamangkot",
  "tubag",
  "palihog",
  "hulat",
  "eNavigator",
];

export const normalizeLanguage = (language?: string): SupportedLanguage => {
  const normalized = language?.trim().toLowerCase() || "";
  for (const [canonical, aliases] of Object.entries(languageAliases) as Array<
    [SupportedLanguage, string[]]
  >) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }
  return "english";
};

export const detectMessageLanguage = (
  message: string,
  fallbackLanguage?: string,
): SupportedLanguage => {
  const normalizedMessage = message.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(languageAliases) as Array<
    [SupportedLanguage, string[]]
  >) {
    if (
      aliases.some((alias) =>
        new RegExp(
          `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i",
        ).test(normalizedMessage),
      )
    ) {
      return canonical;
    }
  }
  // Count Tagalog and Hiligaynon markers
  let tagalogCount = 0;
  let hiligaynonCount = 0;
  for (const marker of tagalogMarkers) {
    if (normalizedMessage.includes(marker)) {
      tagalogCount++;
    }
  }
  for (const marker of hiligaynonMarkers) {
    if (normalizedMessage.includes(marker)) {
      hiligaynonCount++;
    }
  }
  // Prioritize Tagalog if more Tagalog markers, else Hiligaynon if enough markers, else fallback
  if (tagalogCount >= 2 && tagalogCount > hiligaynonCount) {
    return "filipino";
  }
  if (hiligaynonCount >= 2) {
    return "hiligaynon";
  }
  return normalizeLanguage(fallbackLanguage);
};

type LocalizedTextType = "refusal" | "unsupported" | "busy";
export const getLocalizedText = (type: LocalizedTextType, language: string) => {
  const normalized = normalizeLanguage(language);
  const texts = {
    refusal: {
      hiligaynon:
        "Pasensya, indi ko masabat imo pamangkot. Palihog hulat sa eNavigator para mabuligan ka.",
      filipino:
        "Paumanhin, hindi ko masasagot ang tanong mo. Mangyaring maghintay sa eNavigator para sa tulong.",
      bisaya:
        "Pasensya, dili ko makatubag sa imong pangutana. Palihug hulat sa eNavigator para sa tabang.",
      english: DEFAULT_REFUSAL_TEXT,
    },
    unsupported: {
      hiligaynon:
        "Pasensya, indi ko masabat ina kay wala ini sa diagnosis nga ginhatag para sa imo. Palihog hulat sa eNavigator para mabuligan ka.",
      filipino:
        "Paumanhin, hindi ko masasagot iyan dahil wala ito sa diagnosis na ibinigay para sa iyo. Mangyaring maghintay sa eNavigator para sa tulong.",
      bisaya:
        "Pasensya, dili ko makatubag ana kay wala kini sa diagnosis nga gihatag para nimo. Palihug hulat sa eNavigator para sa tabang.",
      english:
        "Sorry, I cannot answer that because it is outside the diagnosis provided for you. Please wait for the eNavigator to assist you.",
    },
    busy: {
      hiligaynon:
        "Pasensya, madamo subong ang nagagamit sang AI assistant. Palihog liwat anay sa makadali.",
      filipino:
        "Paumanhin, maraming gumagamit ng AI assistant ngayon. Pakisubukang muli maya-maya.",
      bisaya:
        "Pasensya, daghan nagagamit sa AI assistant karon. Palihug sulayi balik unya.",
      english:
        "Sorry, the AI assistant is busy right now. Please try again shortly.",
    },
  };
  return texts[type][normalized];
};
