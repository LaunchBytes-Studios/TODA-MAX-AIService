import {
  isMedicationOrDosageQuestion,
  isNormalValueQuestion,
} from "../utils/keyword-utils";
import { PatientContext } from "../types/patient";
import { getLocalizedText } from "../utils/language-utils";
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

// Types

type ChatContent = string;

interface ChatReply {
  reply: ChatContent;
  chatbot_active: boolean;
  usage: unknown;
  detected_language: SupportedLanguage;
}

interface MessageFlags {
  isFoodRelated: boolean;
  isMedicationRelated: boolean;
  isHealthRelated: boolean;
  asksUnsupportedDiagnosis: boolean;
  asksNormalValueQuestion: boolean;
  isGeneralEducation: boolean;
}

// Config

const MODEL_TIMEOUT_MS = 50_000;

const MODELS_TO_TRY = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
] as const;

// Normal-value reply builder

export const buildNormalValueReply = (
  message: string,
  language: SupportedLanguage,
): string => {
  const metric = findMetricByMessage(message);
  const lang = language ?? "english";

  if (!metric) {
    return (
      normalValueFallbackReplies[lang] ?? normalValueFallbackReplies.english
    );
  }

  const def = metric.definition[lang] ?? metric.definition.english;
  const range = metric.range[lang] ?? metric.range.english;
  const note = metric.note[lang] ?? metric.note.english;

  return `${def} ${range} ${note}`;
};

// Message classifier

/**
 * Computes all boolean flags needed to route a message.*/
const classifyMessage = (
  cleanMessage: string,
  conversationContext: string,
  patientContext: PatientContext | undefined,
): MessageFlags => {
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

  return {
    isFoodRelated,
    isMedicationRelated,
    isHealthRelated,
    asksUnsupportedDiagnosis,
    asksNormalValueQuestion,
    isGeneralEducation,
  };
};

// Model fallback loop

interface ModelRunOptions {
  contents: ReturnType<typeof chatServiceHelpers.buildCompletionContents>;
  language: SupportedLanguage;
  refusalText: string;
  patientContext: PatientContext | undefined;
  healthContext: string | undefined;
  debugEnabled: boolean;
}

/**
 * Tries each model in order, falling back on rate-limit / retryable errors.
 * Returns the first successful completion, or a busy-reply object if all 3
 * models are exhausted.
 */
const runModelWithFallback = async (
  options: ModelRunOptions,
): Promise<
  | { kind: "completion"; value: Awaited<ReturnType<typeof createCompletion>> }
  | { kind: "busy" }
> => {
  const {
    contents,
    language,
    refusalText,
    patientContext,
    healthContext,
    debugEnabled,
  } = options;

  let lastError: unknown;

  for (const model of MODELS_TO_TRY) {
    if (debugEnabled) console.log("[AIService] attemptingModel:", model);

    try {
      const value = await chatServiceHelpers.withTimeout(
        createCompletion(model, {
          contents,
          language,
          refusalText,
          patientContext,
          healthContext,
        }),
        MODEL_TIMEOUT_MS,
      );

      if (debugEnabled) console.log("[AIService] completion.text:", value.text);

      return { kind: "completion", value };
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
        return { kind: "busy" };
      }

      if (
        status === 429 ||
        chatServiceHelpers.isRetryableUpstreamStatus(status)
      ) {
        continue; // try next model
      }

      throw error; // non-retryable — bubble up immediately
    }
  }

  // All models exhausted
  const finalStatus = chatServiceHelpers.getUpstreamStatus(lastError);
  if (finalStatus === 429 || finalStatus === 503) {
    return { kind: "busy" };
  }

  throw lastError ?? new Error("Failed to generate completion");
};

// Post-processing
const postProcessReply = (
  rawReply: string | undefined,
  patientContext: PatientContext | undefined,
  healthContext: string | undefined,
  cleanMessage: string,
): string | undefined => {
  if (!rawReply) return rawReply;

  return stripUnsupportedConditionMentions(
    stripUnsupportedSourceClaims(
      stripInventedGreeting(rawReply, patientContext),
      healthContext,
    ),
    patientContext,
    cleanMessage,
  );
};

// Main entrypoint
export const generateChatReply = async (
  message: ChatContent,
  language?: string,
  history?: ChatHistoryItem[],
  patientContext?: PatientContext,
  healthContext?: string,
): Promise<ChatReply> => {
  // --- Normalise inputs ---
  const cleanMessage = message.trim();
  const safeHistory = chatServiceHelpers.normalizeHistory(history ?? []);
  const conversationContext = chatServiceHelpers.buildConversationContext(
    cleanMessage,
    safeHistory,
  );

  // --- Language resolution ---
  let historyLanguage: SupportedLanguage | undefined;
  for (let i = safeHistory.length - 1; i >= 0; i--) {
    if (safeHistory[i].role === "patient" && safeHistory[i].content) {
      historyLanguage = chatServiceHelpers.resolveEffectiveLanguage({
        requestedLanguage: language,
        message: safeHistory[i].content,
      });
      break;
    }
  }

  const effectiveLanguage = chatServiceHelpers.resolveEffectiveLanguage({
    requestedLanguage: language,
    historyLanguage,
    message: cleanMessage,
  });

  // --- Shared text lookups ---
  const busyText = getLocalizedText("busy", effectiveLanguage);
  const refusalText = getLocalizedText("refusal", effectiveLanguage);
  const unsupportedDiagnosisText = getLocalizedText(
    "unsupported",
    effectiveLanguage,
  );

  const debugEnabled =
    process.env.AI_DEBUG_LOGS === "true" ||
    process.env.NODE_ENV !== "production";

  // --- Classify ---
  const flags = classifyMessage(
    cleanMessage,
    conversationContext,
    patientContext,
  );

  if (debugEnabled) {
    console.log("\n=== AI SERVICE DEBUG ===");
    console.log("[AIService] cleanMessage:", cleanMessage);
    console.log("[AIService] flags:", JSON.stringify(flags));
    console.log("[AIService] patientContext:", JSON.stringify(patientContext));
    console.log("======================\n");
  }

  // --- Early returns ---
  if (!flags.asksNormalValueQuestion && flags.asksUnsupportedDiagnosis) {
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

  if (flags.asksNormalValueQuestion) {
    const metricsReply = buildNormalValueReply(cleanMessage, effectiveLanguage);
    if (debugEnabled) console.log("[AIService] metricsReply:", metricsReply);
    return {
      reply: metricsReply,
      chatbot_active: true,
      detected_language: effectiveLanguage,
      usage: null,
    };
  }

  // --- LLM call with model fallback ---
  const contents = chatServiceHelpers.buildCompletionContents(
    safeHistory,
    cleanMessage,
  );

  const result = await runModelWithFallback({
    contents,
    language: effectiveLanguage,
    refusalText,
    patientContext,
    healthContext,
    debugEnabled,
  });

  if (result.kind === "busy") {
    return {
      reply: busyText,
      chatbot_active: false,
      detected_language: effectiveLanguage,
      usage: null,
    };
  }

  const completion = result.value;
  const medicationFallback = flags.isMedicationRelated
    ? chatServiceHelpers.buildMedicationFallback(effectiveLanguage)
    : null;

  // Empty response on a medication question — return fallback immediately
  if (!completion.text && flags.isMedicationRelated) {
    if (debugEnabled) {
      console.log(
        "[AIService] Empty completion for medication question; using fallback",
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

  // --- Post-processing ---
  const normalizedReply = postProcessReply(
    completion.text?.trim(),
    patientContext,
    healthContext,
    cleanMessage,
  );

  const finalReply = chatServiceHelpers.resolveFinalReply({
    rawReply: normalizedReply,
    refusalText,
    isMedicationRelated: flags.isMedicationRelated,
    isGeneralEducation: flags.isGeneralEducation,
    medicationFallback,
  });

  const isRefusal = normalizedReply === refusalText;

  if (debugEnabled) {
    console.log("[AIService] rawReply:", completion.text?.trim());
    console.log("[AIService] normalized:", normalizedReply);
    console.log("[AIService] final:", finalReply);
  }

  return {
    reply: finalReply || "Sorry, I couldn't generate a response.",
    chatbot_active: !isRefusal && flags.isGeneralEducation,
    detected_language: effectiveLanguage,
    usage: completion.usageMetadata,
  };
};
