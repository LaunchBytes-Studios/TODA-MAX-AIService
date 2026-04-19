//chat reply helper
import { PatientContext } from "../types/patient";

export const stripInventedGreeting = (
  reply: string,
  patient?: PatientContext,
): string => {
  if (patient?.name) {
    return reply;
  }
  return reply.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[!,.]?\s*/i, "");
};

export const stripUnsupportedSourceClaims = (
  reply: string,
  healthContext?: string,
): string => {
  if (healthContext?.trim()) {
    return reply;
  }
  return reply
    .replace(
      /\b(according to|based on)\s+(the\s+)?(health\s+guide|guide|handout|document|information provided)[,:\s-]*/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
};

export const stripUnsupportedConditionMentions = (
  reply: string,
  patient?: PatientContext,
): string => {
  const hasDiabetes = Boolean(patient?.diagnosis?.diabetes);
  const hasHypertension = Boolean(patient?.diagnosis?.hypertension);
  if (hasDiabetes && !hasHypertension) {
    return reply
      .replace(
        /\b(high blood pressure|blood pressure|hypertension|hypertensive)\b/gi,
        "your condition",
      )
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  if (hasHypertension && !hasDiabetes) {
    return reply
      .replace(
        /\b(diabetes|diabetic|blood sugar|glucose|insulin|hypoglycemia|hyperglycemia)\b/gi,
        "your condition",
      )
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return reply;
};
