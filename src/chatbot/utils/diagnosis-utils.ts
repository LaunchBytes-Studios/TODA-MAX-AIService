import {
  diabetesKeywordPatterns,
  foodKeywords,
  healthKeywordPatterns,
  hypertensionKeywordPatterns,
  mentionsKeyword,
} from "./lib/chat-keywords";
import { PatientContext } from "../types/patient";
import { isReferenceMetricQuestion } from "./keyword-utils";

export const isHealthRelatedMessage = (message: string): boolean => {
  // treat general metric questions as health-related too.
  return (
    mentionsKeyword(message, healthKeywordPatterns) ||
    isReferenceMetricQuestion(message)
  );
};

export const isFoodRelatedMessage = (message: string): boolean => {
  return mentionsKeyword(message, foodKeywords);
};

export const hasSupportedDiagnosis = (patient?: PatientContext): boolean => {
  if (!patient?.diagnosis) {
    return false;
  }
  return Boolean(patient.diagnosis.diabetes || patient.diagnosis.hypertension);
};

export const asksAboutUnsupportedDiagnosis = (
  message: string,
  patient?: PatientContext,
): boolean => {
  // always allow general reference/metric questions like normal blood sugar or BP.
  const isGeneralMetricQuestion = isReferenceMetricQuestion(message);

  const debugEnabled =
    process.env.AI_DEBUG_LOGS === "true" ||
    process.env.NODE_ENV !== "production";

  if (debugEnabled) {
    console.log("[asksAboutUnsupportedDiagnosis] Testing message:", message);
    console.log(
      "[asksAboutUnsupportedDiagnosis] isReferenceMetricQuestion:",
      isGeneralMetricQuestion,
    );
  }

  if (isGeneralMetricQuestion) {
    if (debugEnabled) {
      console.log(
        "[asksAboutUnsupportedDiagnosis] general reference metric question - ALLOWED",
      );
    }
    return false;
  }

  const mentionsDiabetes = mentionsKeyword(message, diabetesKeywordPatterns);
  const mentionsHypertension = mentionsKeyword(
    message,
    hypertensionKeywordPatterns,
  );
  const hasDiabetes = Boolean(patient?.diagnosis?.diabetes);
  const hasHypertension = Boolean(patient?.diagnosis?.hypertension);

  if (debugEnabled) {
    console.log(
      "[asksAboutUnsupportedDiagnosis] mentionsDiabetes:",
      mentionsDiabetes,
      "hasDiabetes:",
      hasDiabetes,
    );
    console.log(
      "[asksAboutUnsupportedDiagnosis] mentionsHypertension:",
      mentionsHypertension,
      "hasHypertension:",
      hasHypertension,
    );
  }

  if (mentionsHypertension && !hasHypertension) {
    return true;
  }

  if (mentionsDiabetes && !hasDiabetes) {
    return true;
  }

  return false;
};
