import {
  diabetesKeywordPatterns,
  foodKeywords,
  healthKeywordPatterns,
  hypertensionKeywordPatterns,
  mentionsKeyword,
} from "../utils/lib/chat-keywords";
import { PatientContext } from "../types/patient";

export const isHealthRelatedMessage = (message: string): boolean => {
  return mentionsKeyword(message, healthKeywordPatterns);
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
  const mentionsDiabetes = mentionsKeyword(message, diabetesKeywordPatterns);
  const mentionsHypertension = mentionsKeyword(
    message,
    hypertensionKeywordPatterns,
  );
  const hasDiabetes = Boolean(patient?.diagnosis?.diabetes);
  const hasHypertension = Boolean(patient?.diagnosis?.hypertension);

  if (mentionsHypertension && !hasHypertension) {
    return true;
  }
  if (mentionsDiabetes && !hasDiabetes) {
    return true;
  }
  return false;
};
