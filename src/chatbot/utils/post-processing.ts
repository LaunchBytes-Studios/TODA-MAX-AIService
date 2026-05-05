// Post-processing helpers for model-generated replies.
// These perform small, safe transformations (remove greetings, redact
// unsupported source claims, and avoid condition-specific mentions unless
// context is present).
import { PatientContext } from "../types/patient";
import { isNormalValueQuestion } from "./keyword-utils";

export const stripInventedGreeting = (
  reply: string,
  patient?: PatientContext,
): string => {
  // Remove model-invented greetings when we don't have a name to address.
  if (patient?.name) {
    return reply;
  }
  return reply.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[!,.]?\s*/i, "");
};

export const stripUnsupportedSourceClaims = (
  reply: string,
  healthContext?: string,
): string => {
  // Remove phrases like "according to the guide" unless the user
  // supplied supporting `healthContext` so we don't invent sources.
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
  userMessage?: string,
): string => {
  // When the user only asked for normal/reference values we keep
  // condition mentions intact. Otherwise redact condition-specific
  // words to the generic "your condition" unless context indicates
  // it's safe to be specific.
  if (userMessage && isNormalValueQuestion(userMessage)) {
    return reply;
  }
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
