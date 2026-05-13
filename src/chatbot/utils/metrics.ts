import { SupportedLanguage } from "../types/language";

// Small data-driven metric registry. Keep human-readable strings
// here so the chat orchestration stays simple and testable.
type MetricEntry = {
  key: string;
  synonyms: string[];
  definition: Record<SupportedLanguage, string>;
  range: Record<SupportedLanguage, string>;
  note: Record<SupportedLanguage, string>;
};

// keep these metric replies data-driven so the chat service stays simple.
export const metricDefinitions: MetricEntry[] = [
  {
    key: "bloodSugar",
    synonyms: ["blood sugar", "glucose", "sugar", "diabetes"],
    definition: {
      hiligaynon:
        "Ang blood sugar (glucose) amo ang kantidad sang asukar sa imo dugo.",
      filipino:
        "Ang blood sugar (glucose) ay ang dami ng asukal sa iyong dugo.",
      bisaya:
        "Ang blood sugar (glucose) mao ang kantidad sa asukal sa imong dugo.",
      english: "Blood sugar (glucose) is the amount of sugar in your blood.",
    },
    range: {
      hiligaynon:
        "Normal nga fasting: 70-99 mg/dL; 2h post-meal: kasagaran <140 mg/dL.",
      filipino:
        "Normal na fasting: 70-99 mg/dL; 2h pagkatapos kumain: karaniwan <140 mg/dL.",
      bisaya:
        "Normal fasting: 70-99 mg/dL; 2h human kaon: kasagaran <140 mg/dL.",
      english:
        "Normal fasting: 70-99 mg/dL; 2 hours after eating: usually <140 mg/dL.",
    },
    note: {
      hiligaynon:
        "Ang ranges mahimo maglain depende sa laboratoryo kag indi ini personal nga tambag.",
      filipino:
        "Maaaring mag-iba ang ranges depende sa laboratoryo at hindi ito personal na payo.",
      bisaya:
        "Mahimo magkalahi ang ranges depende sa laboratoryo ug dili kini personal nga tambag.",
      english:
        "Ranges can vary by lab and this is not personal medical advice.",
    },
  },
  {
    key: "bloodPressure",
    synonyms: ["blood pressure", "bp", "hypertension", "high blood pressure"],
    definition: {
      hiligaynon:
        "Ang blood pressure amo ang pressure sang dugo batok sa dingding sang imo mga ugat.",
      filipino:
        "Ang blood pressure ay ang presyon ng dugo laban sa mga pader ng daluyan ng dugo.",
      bisaya:
        "Ang blood pressure mao ang pressure sa dugo batok sa dingding sa imong mga ugat.",
      english:
        "Blood pressure is the force of blood against the walls of your arteries.",
    },
    range: {
      hiligaynon:
        "Normal: mga 120/80 mmHg o mas manubo para sa kadam-an nga hamtong.",
      filipino:
        "Normal: mga 120/80 mmHg o mas mababa para sa karamihan ng adults.",
      bisaya:
        "Normal: mga 120/80 mmHg o mas ubos para sa kadaghanan sa adults.",
      english: "Normal: around 120/80 mmHg for most adults.",
    },
    note: {
      hiligaynon:
        "Ang ideal nga target mahimo maglain depende sa edad kag kondisyon sang doktor.",
      filipino:
        "Ang ideal na target ay maaaring mag-iba depende sa edad at kondisyon.",
      bisaya:
        "Ang ideal nga target mahimong magkalahi depende sa edad ug kondisyon.",
      english: "Ideal targets can vary with age and medical conditions.",
    },
  },
];

export const findMetricByMessage = (message: string) => {
  // Simple lookup: return the first metric whose synonyms appear
  // in the incoming message. This keeps logic deterministic.
  const normalized = message.toLowerCase();
  for (const metric of metricDefinitions) {
    for (const syn of metric.synonyms) {
      if (normalized.includes(syn)) return metric;
    }
  }
  return null;
};
