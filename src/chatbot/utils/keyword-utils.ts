// Keyword and pattern detection utilities.
// These helpers try to match common multilingual phrasing for
// normal/reference metric questions and medication/dosage queries.

const referenceTerms =
  "(normal|reference|range|level|levels|reading|readings|ideal|usual)";
const commonMetrics =
  "(blood\\s+sugar|blood\\s+pressure|glucose|cholesterol|\\bbp\\b)";
const questionLeads =
  "(ano|what|pila|tagpila|how|which|diin|hain|pwede|maaari|can)";

export const normalizeMetricQuestionText = (message: string): string => {
  // Normalize common typos and repeated words before pattern matching.
  return message
    .toLowerCase()
    .replace(/\busualy\b/g, "usual")
    .replace(/\busualyy\b/g, "usual")
    .replace(/\busally\b/g, "usual")
    .replace(/\bblood\s+blood\s+pressure\b/g, "blood pressure")
    .replace(/\bblood\s+blood\s+sugar\b/g, "blood sugar")
    .replace(/\s+/g, " ")
    .trim();
};

export const isReferenceMetricQuestion = (message: string): boolean => {
  // Returns true for broader "reference" style questions (multilingual).
  const normalizedMessage = normalizeMetricQuestionText(message);
  const patterns = [
    new RegExp(`${referenceTerms}\\s+(nga|na)?\\s*${commonMetrics}`, "i"),
    new RegExp(`${commonMetrics}\\s+${referenceTerms}`, "i"),
    new RegExp(`${questionLeads}\\s+(?:\\w+\\s+){0,4}${referenceTerms}`, "i"),
    new RegExp(`${questionLeads}\\s+(?:\\w+\\s+){0,10}${commonMetrics}`, "i"),
  ];

  return patterns.some((pattern) => pattern.test(normalizedMessage));
};

export const isNormalValueQuestion = (message: string): boolean => {
  // Detects whether the user asks for normal/reference values.
  // This is intentionally broad to cover local phrasing variations.
  const normalizedMessage = normalizeMetricQuestionText(message);
  const patterns = [
    /normal\s+(value|range|reading|readings|level|levels|blood pressure|bp|blood sugar|sugar|glucose|cholesterol)/i,
    /normal\s+(nga|na)\s+(value|range|reading|readings|level|levels|blood pressure|bp|blood sugar|sugar|glucose|cholesterol)/i,
    /reference\s+(value|range|level|levels)/i,
    /ano\s+(\w+\s+)*normal/i,
    /ano\s+(\w+\s+)*normal\s+(nga|na)/i,
    /ano\s+(\w+\s+)*reference/i,
    /what\s+is\s+(the\s+)?normal\s+(blood\s+pressure|blood\s+sugar|glucose|cholesterol|bp)/i,
    /what\s+is\s+a\s+normal\s+(blood\s+pressure|blood\s+sugar|glucose|cholesterol|bp)/i,
    /what\s+are\s+(the\s+)?normal\s+\w+\s+(level|levels|range|ranges)/i,
    /what is normal/i,
    /what are normal/i,
    /what's normal/i,
    /normal ba ang/i,
    /normal ko nga/i,
    /normal\s+nga/i,
    /normal\s+na/i,
    /normal value/i,
    /reference value/i,
    /(normal|reference|range|level)\s+(nga|na)?\s*(blood\s+sugar|blood\s+pressure|glucose|cholesterol)\b/i,
    /(blood\s+sugar|blood\s+pressure|glucose|cholesterol)\s+(normal|reference|range|level)\b/i,
    /(normal|reference|range|level)\s+(nga|na)?\s*\bbp\b/i,
    /\bbp\b\s+(normal|reference|range|level)\b/i,
  ];
  const debugEnabled =
    process.env.AI_DEBUG_LOGS === "true" ||
    process.env.NODE_ENV !== "production";
  if (debugEnabled) {
    console.log("[isNormalValueQuestion] Testing message:", normalizedMessage);
  }
  const matchedIndex = patterns.findIndex((pat) => pat.test(normalizedMessage));
  const referenceMetricMatch = isReferenceMetricQuestion(message);
  const result = matchedIndex >= 0 || referenceMetricMatch;
  if (debugEnabled) {
    patterns.forEach((pat, idx) => {
      if (pat.test(normalizedMessage)) {
        console.log(`[isNormalValueQuestion] matched pattern ${idx}:`, pat);
      }
    });
    if (referenceMetricMatch) {
      console.log(
        "[isNormalValueQuestion] matched multilingual reference/metric fallback",
      );
    }
    console.log(
      "[isNormalValueQuestion] FINAL Result:",
      result,
      "First matching pattern index:",
      matchedIndex >= 0 ? matchedIndex : "NONE",
    );
  }
  return result;
};

export function isMedicationOrDosageQuestion(message: string): boolean {
  // Detects medication- or dosage-related questions so the service
  // can short-circuit to safer, non-prescriptive replies.
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, " ").trim();
  const medicationPatterns = [
    /\b(medicine|medication|drug|gamot|bulong|tableta|pill|capsule|insulin|metformin|sulfonylurea|sglt2|glp-1)\b/i,
    /\b(take|should i take|prescribe|prescription|dose|dosage|ilang mg|how many mg|how much|ilang beses|how often|mainom|inumon|inomon|imnon|inum|iwas|pwede ko mainom|pwede ko inumon)\b/i,
    /\b(ano|what|pila|tagpila|how|pwede|maaari|can)\b(?:\s+\w+){0,6}\s+\b(medicine|medication|drug|gamot|bulong|tableta|pill|capsule|insulin|metformin)\b/i,
  ];
  return medicationPatterns.some((pattern) => pattern.test(normalizedMessage));
}
