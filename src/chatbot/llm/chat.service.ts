//this service coordinates detection of normal-value questions
import {
  isMedicationOrDosageQuestion,
  isNormalValueQuestion,
} from "../utils/keyword-utils";
import { PatientContext } from "../types/patient";
import {
  detectMessageLanguage,
  getLocalizedText,
} from "../utils/language-utils";
import { findMetricByMessage } from "../utils/metrics";
import {
  stripInventedGreeting,
  stripUnsupportedSourceClaims,
  stripUnsupportedConditionMentions,
} from "../utils/post-processing";
import { SupportedLanguage } from "../types/language";
import {
  hasSupportedDiagnosis,
  asksAboutUnsupportedDiagnosis,
  isHealthRelatedMessage,
  isFoodRelatedMessage,
} from "../utils/diagnosis-utils";
import { createCompletion } from "./gemini-provider";
import * as chatServiceHelpers from "./chat.service.helpers";
import type { ChatHistoryItem } from "./chat.service.helpers";
import { normalValueFallbackReplies } from "../utils/reply-texts";

type ChatContent = string;

const modelsToTry = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
];

export const buildNormalValueReply = (
  message: string,
  language: SupportedLanguage,
): string => {
  const metric = findMetricByMessage(message);
  const lang = language ?? "english";
  if (!metric) {
    // No specific metric matched, return the generic fallback.
    return (
      normalValueFallbackReplies[lang] ?? normalValueFallbackReplies.english
    );
  }

  const def = metric.definition[lang] ?? metric.definition.english;
  const range = metric.range[lang] ?? metric.range.english;
  const note = metric.note[lang] ?? metric.note.english;

  return `${def} ${range} ${note}`;
};

// Main entrypoint used by the Express controller. Keeps top-level flow
// readable: detect special cases (normal-values, medication), then
// fall back to the LLM with safe post-processing.

export const generateChatReply = async (
  message: ChatContent,
  language?: string,
  history?: ChatHistoryItem[],
  patientContext?: PatientContext,
  healthContext?: string,
): Promise<{
  reply: ChatContent;
  chatbot_active: boolean;
  usage: unknown;
  detected_language: SupportedLanguage;
}> => {
  const cleanMessage = message.trim();
  const safeHistory = chatServiceHelpers.normalizeHistory(history || []);
  const conversationContext = chatServiceHelpers.buildConversationContext(
    cleanMessage,
    safeHistory,
  );

  let historyLanguage: SupportedLanguage | undefined = undefined;
  for (let i = safeHistory.length - 1; i >= 0; i--) {
    if (safeHistory[i].role === "patient" && safeHistory[i].content) {
      historyLanguage = detectMessageLanguage(safeHistory[i].content, language);
      break;
    }
  }

  const effectiveLanguage = chatServiceHelpers.resolveEffectiveLanguage({
    requestedLanguage: language,
    historyLanguage,
    message: cleanMessage,
  });

  const busyText = getLocalizedText("busy", effectiveLanguage);
  const debugEnabled =
    process.env.AI_DEBUG_LOGS === "true" ||
    process.env.NODE_ENV !== "production";
  const hasDiagnosisContext = hasSupportedDiagnosis(patientContext);
  const isFoodRelated = isFoodRelatedMessage(conversationContext);
  const isMedicationRelated = isMedicationOrDosageQuestion(cleanMessage);
  const isHealthRelated =
    isHealthRelatedMessage(conversationContext) ||
    (isFoodRelated && hasDiagnosisContext) ||
    (isMedicationRelated && hasDiagnosisContext);
  const asksUnsupportedDiagnosis = asksAboutUnsupportedDiagnosis(
    cleanMessage,
    patientContext,
  );
  const asksNormalValueQuestion = isNormalValueQuestion(cleanMessage);
  const isGeneralEducation = isHealthRelated || asksNormalValueQuestion;
  const refusalText = getLocalizedText("refusal", effectiveLanguage);
  const unsupportedDiagnosisText = getLocalizedText(
    "unsupported",
    effectiveLanguage,
  );
  const contents = chatServiceHelpers.buildCompletionContents(
    safeHistory,
    cleanMessage,
  );

  console.log("\n=== AI SERVICE DEBUG ===");
  console.log("[AIService] cleanMessage:", cleanMessage);
  console.log("[AIService] asksNormalValueQuestion:", asksNormalValueQuestion);
  console.log(
    "[AIService] asksUnsupportedDiagnosis:",
    asksUnsupportedDiagnosis,
  );
  console.log("[AIService] isHealthRelated:", isHealthRelated);
  console.log("[AIService] isGeneralEducation:", isGeneralEducation);
  console.log("[AIService] patientContext:", JSON.stringify(patientContext));
  console.log("======================\n");

  if (!asksNormalValueQuestion && asksUnsupportedDiagnosis) {
    return {
      reply:
        unsupportedDiagnosisText ||
        refusalText ||
        "Sorry, I cannot answer that question.",
      chatbot_active: false,
      detected_language: effectiveLanguage,
      usage: null,
    };
  }

  if (asksNormalValueQuestion) {
    const metricsReply = buildNormalValueReply(cleanMessage, effectiveLanguage);
    if (debugEnabled) {
      console.log(
        "[AIService] Using metrics-based reply for normal-value question",
      );
      console.log("[AIService] metricsReply:", metricsReply);
    }
    return {
      reply: metricsReply,
      chatbot_active: true,
      detected_language: effectiveLanguage,
      usage: null,
    };
  }

  let completion = null as Awaited<ReturnType<typeof createCompletion>> | null;
  let lastError: unknown;

  for (const model of modelsToTry) {
    try {
      if (debugEnabled) {
        console.log("[AIService] attemptingModel:", model);
      }

      completion = await chatServiceHelpers.withTimeout(
        createCompletion(model, {
          contents,
          language: effectiveLanguage,
          refusalText,
          patientContext,
          healthContext,
        }),
        50000,
      );

      if (debugEnabled) {
        console.log("[AIService] completion.text:", completion.text);
      }

      break;
    } catch (error) {
      lastError = error;
      const status = chatServiceHelpers.getUpstreamStatus(error);

      if (debugEnabled) {
        console.log(
          "[AIService] modelAttemptFailed:",
          model,
          "status:",
          status,
        );
      }

      if (error instanceof Error && error.message === "LLM timeout") {
        return {
          reply: busyText,
          chatbot_active: false,
          detected_language: effectiveLanguage,
          usage: null,
        };
      }

      if (status === 429) {
        break;
      }

      if (chatServiceHelpers.isRetryableUpstreamStatus(status)) {
        continue;
      }

      throw error;
    }
  }

  if (!completion) {
    const finalStatus = chatServiceHelpers.getUpstreamStatus(lastError);
    if (finalStatus === 429 || finalStatus === 503) {
      return {
        reply: busyText,
        chatbot_active: false,
        detected_language: effectiveLanguage,
        usage: null,
      };
    }

    throw lastError ?? new Error("Failed to generate completion");
  }

  const medicationFallback = isMedicationRelated
    ? chatServiceHelpers.buildMedicationFallback(effectiveLanguage)
    : null;

  if (!completion.text && isMedicationRelated) {
    if (debugEnabled) {
      console.log(
        "[AIService] completion.text is undefined; returning medicationFallback",
      );
    }

    return {
      reply:
        medicationFallback ??
        refusalText ??
        "Sorry, I couldn't generate a response.",
      chatbot_active: true,
      detected_language: effectiveLanguage,
      usage: completion.usageMetadata,
    };
  }

  const rawReply = completion.text?.trim();
  const normalizedReply = rawReply
    ? stripUnsupportedConditionMentions(
        stripUnsupportedSourceClaims(
          stripInventedGreeting(rawReply, patientContext),
          healthContext,
        ),
        patientContext,
        cleanMessage,
      )
    : rawReply;

  const finalReply = chatServiceHelpers.resolveFinalReply({
    rawReply: normalizedReply,
    refusalText,
    isMedicationRelated,
    isGeneralEducation,
    medicationFallback,
  });
  const isRefusal = normalizedReply === refusalText;

  if (debugEnabled) {
    console.log("[AIService] rawReply:", rawReply);
    console.log("[AIService] reply:", normalizedReply);
    console.log("[AIService] finalReply:", finalReply);
  }

  return {
    reply: finalReply || "Sorry, I couldn't generate a response.",
    chatbot_active: !isRefusal && isGeneralEducation,
    detected_language: effectiveLanguage,
    usage: completion.usageMetadata,
  };
};
