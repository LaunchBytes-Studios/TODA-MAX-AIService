// For keyword/pattern detection

export const isNormalValueQuestion = (message: string): boolean => {
  const patterns = [
    /normal\s+(value|range|reading|level|blood pressure|bp|sugar|glucose|cholesterol)/i,
    /reference\s+(value|range|level)/i,
    /ano ang normal/i,
    /ano ang reference/i,
    /what is normal/i,
    /what's normal/i,
    /normal ba ang/i,
    /normal ko nga/i,
    /normal value/i,
    /reference value/i,
  ];
  return patterns.some((pat) => pat.test(message));
};

export function isMedicationOrDosageQuestion(message: string): boolean {
  const medicationPatterns = [
    /\b(medicine|medication|drug|gamot|tableta|pill|capsule|insulin|metformin|sulfonylurea|sglt2|glp-1)\b/i,
    /\b(take|should I take|prescribe|prescription|dose|dosage|ilang mg|how many mg|how much|ilang beses|how often)\b/i,
  ];
  return medicationPatterns.some((pattern) => pattern.test(message));
}
