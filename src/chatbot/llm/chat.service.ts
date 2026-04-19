import { isMedicationOrDosageQuestion } from "../utils/keyword-utils";
import { PatientContext } from "../types/patient";
import {
  normalizeLanguage,
  detectMessageLanguage,
  getLocalizedText,
} from "../utils/language-utils";
import { isNormalValueQuestion } from "../utils/keyword-utils";
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
} from "./diagnosis-utils";
import { createCompletion } from "./gemini-provider";

// --- Inlined from history-utils.ts ---
const normalizeHistory = (
  history: { role: string; content: string }[],
): { role: string; content: string }[] => {
  return history
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content)
    .slice(-3);
};

const buildConversationContext = (
  message: string,
  history: { role: string; content: string }[],
): string => {
  const recentHistory = normalizeHistory(history)
    .map((item) => item.content)
    .join(" ");
  return `${recentHistory} ${message}`.trim();
};

type ChatRole = "patient" | "chatbot";
type GeminiAiRole = "user" | "model";
type ChatContent = string;

type ChatHistoryItem = {
  role: ChatRole;
  content: ChatContent;
};
const modelsToTry = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
];

const roleMapping: Record<ChatRole, GeminiAiRole> = {
  patient: "user",
  chatbot: "model",
};

const getUpstreamStatus = (error: unknown): number | null => {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
};

const isRetryableUpstreamStatus = (status: number | null): boolean => {
  return status === 404 || status === 503;
};

// Helper to add a timeout to a promise
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LLM timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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

  const safeHistory = normalizeHistory(history || []);
  const conversationContext = buildConversationContext(
    cleanMessage,
    safeHistory,
  );
  const requestedLanguage = normalizeLanguage(language);
  // Find the most recent user message in the history for language context
  let historyLanguage: SupportedLanguage | undefined = undefined;
  for (let i = safeHistory.length - 1; i >= 0; i--) {
    if (safeHistory[i].role === "patient" && safeHistory[i].content) {
      // Try to detect language from the message content
      historyLanguage = detectMessageLanguage(safeHistory[i].content, language);
      break;
    }
  }
  // Always use the detected language of the latest user message, unless an explicit language is set
  let effectiveLanguage: SupportedLanguage;
  if (requestedLanguage && requestedLanguage !== "english") {
    effectiveLanguage = requestedLanguage;
  } else if (historyLanguage && historyLanguage !== "english") {
    effectiveLanguage = historyLanguage;
  } else {
    effectiveLanguage = detectMessageLanguage(cleanMessage, language);
  }

  const busyText = getLocalizedText("busy", effectiveLanguage);
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
  const refusalText = getLocalizedText("refusal", effectiveLanguage);
  const unsupportedDiagnosisText = getLocalizedText(
    "unsupported",
    effectiveLanguage,
  );
  const mappedHistory = safeHistory.map((item) => ({
    role: roleMapping[item.role as ChatRole],
    parts: [{ text: item.content }],
  }));
  const contents = [
    ...mappedHistory,
    {
      role: "user" as const,
      parts: [{ text: cleanMessage }],
    },
  ];

  // Debug logging for fallback logic
  if (process.env.NODE_ENV !== "production") {
    console.log("[AIService] patientContext:", JSON.stringify(patientContext));
    console.log("[AIService] healthContext:", healthContext);
    console.log("[AIService] isFoodRelated:", isFoodRelated);
    console.log("[AIService] hasDiagnosisContext:", hasDiagnosisContext);
    console.log("[AIService] isHealthRelated:", isHealthRelated);
    console.log(
      "[AIService] asksUnsupportedDiagnosis:",
      asksUnsupportedDiagnosis,
    );
    console.log("[AIService] effectiveLanguage:", effectiveLanguage);
    console.log("[AIService] conversationContext:", conversationContext);
  }
  // Escalate/refuse if question is about normal/reference values
  if (
    asksUnsupportedDiagnosis ||
    isNormalValueQuestion(cleanMessage) ||
    isMedicationOrDosageQuestion(cleanMessage)
  ) {
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

  let completion = null as Awaited<ReturnType<typeof createCompletion>> | null;
  let lastError: unknown;

  for (const model of modelsToTry) {
    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("[AIService] attemptingModel:", model);
      }
      // Add a 50s timeout to the LLM call
      completion = await withTimeout(
        createCompletion(model, {
          contents,
          language: effectiveLanguage,
          refusalText,
          patientContext,
          healthContext,
        }),
        50000, // 50 seconds
      );
      if (process.env.NODE_ENV !== "production") {
        console.log("[AIService] completion.text:", completion.text);
      }
      break;
    } catch (error) {
      lastError = error;
      const status = getUpstreamStatus(error);
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[AIService] modelAttemptFailed:",
          model,
          "status:",
          status,
        );
      }
      if (error instanceof Error && error.message === "LLM timeout") {
        // If the LLM times out, return a busy message
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
      if (isRetryableUpstreamStatus(status)) {
        continue;
      }
      throw error;
    }
  }
  // SIMULATION: Force busy fallback for testing if a special flag is present in the message
  if (cleanMessage.includes("__simulate_busy__")) {
    return {
      reply: busyText,
      chatbot_active: false,
      detected_language: effectiveLanguage,
      usage: null,
    };
  }
  if (!completion) {
    const finalStatus = getUpstreamStatus(lastError);
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

  const rawReply = completion.text?.trim();
  const reply = rawReply
    ? stripUnsupportedConditionMentions(
        stripUnsupportedSourceClaims(
          stripInventedGreeting(rawReply, patientContext),
          healthContext,
        ),
        patientContext,
      )
    : rawReply;
  const isRefusal = reply === refusalText;
  const finalReply = !isHealthRelated && !isRefusal ? refusalText : reply;
  // ADD THIS:
  if (process.env.NODE_ENV !== "production") {
    console.log("[AIService] rawReply:", rawReply);
    console.log("[AIService] reply:", reply);
    console.log("[AIService] finalReply:", finalReply);
  }
  return {
    reply: finalReply || "Sorry, I couldn't generate a response.",
    chatbot_active: !isRefusal && isHealthRelated,
    detected_language: effectiveLanguage,
    usage: completion.usageMetadata,
  };
};
