// Small helpers used by `chat.service.ts` to keep orchestration
// logic focused and easier to test. These functions perform pure
// transformations and lightweight runtime checks.
import {
  detectMessageLanguage,
  normalizeLanguage,
} from "../utils/language-utils";
import { medicationFallbackReplies } from "../utils/reply-texts";
import { SupportedLanguage } from "../types/language";

const MAX_HISTORY_MESSAGES = 3;
const LLM_TIMEOUT_MESSAGE = "LLM timeout";

export type ChatRole = "patient" | "chatbot";
export type GeminiAiRole = "user" | "model";

export type ChatHistoryItem = {
  role: ChatRole;
  content: string;
};

type GeminiContent = {
  role: GeminiAiRole;
  parts: Array<{ text: string }>;
};

const mapChatRoleToGeminiRole = (role: ChatRole): GeminiAiRole =>
  role === "patient" ? "user" : "model";

export const normalizeHistory = (
  history: { role: string; content: string }[],
): ChatHistoryItem[] => {
  // keep only the latest few messages so the prompt stays focused.
  return history
    .map((item) => ({
      role: item.role as ChatRole,
      content: typeof item.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_MESSAGES);
};

export const buildConversationContext = (
  message: string,
  history: { role: string; content: string }[],
): string => {
  // keep only the latest few messages so the prompt stays focused.
  const recentHistory = normalizeHistory(history)
    .map((item) => item.content)
    .join(" ");
  return `${recentHistory} ${message}`.trim();
};

export const resolveEffectiveLanguage = ({
  requestedLanguage,
  historyLanguage,
  message,
}: {
  requestedLanguage?: string;
  historyLanguage?: SupportedLanguage;
  message: string;
}): SupportedLanguage => {
  // allow an explicit language first, then history, then the current message.
  if (requestedLanguage && requestedLanguage !== "english") {
    return normalizeLanguage(requestedLanguage);
  }

  if (historyLanguage && historyLanguage !== "english") {
    return historyLanguage;
  }

  return detectMessageLanguage(message, requestedLanguage);
};

export const buildCompletionContents = (
  history: ChatHistoryItem[],
  message: string,
): GeminiContent[] => {
  // keep only the latest few messages so the prompt stays focused.
  const mappedHistory = history.map((item) => ({
    role: mapChatRoleToGeminiRole(item.role),
    parts: [{ text: item.content }],
  }));

  return [
    ...mappedHistory,
    {
      role: "user" as const,
      parts: [{ text: message }],
    },
  ];
};

export const buildMedicationFallback = (
  language: SupportedLanguage,
): string => {
  // keep this safe and general because I do not want to prescribe here.
  const replySet =
    medicationFallbackReplies[language] ?? medicationFallbackReplies.english;
  return replySet.general;
};

export const getUpstreamStatus = (error: unknown): number | null => {
  // keep only the status code when the upstream error actually has one.
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
};

export const isRetryableUpstreamStatus = (status: number | null): boolean => {
  // keep only the statuses that usually clear up on their own.
  return status === 404 || status === 503;
};

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // keep only the status code when the upstream error actually has one.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(LLM_TIMEOUT_MESSAGE)), ms);
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

export const resolveFinalReply = ({
  rawReply,
  refusalText,
  isMedicationRelated,
  isGeneralEducation,
  medicationFallback,
}: {
  rawReply: string | undefined;
  refusalText: string;
  isMedicationRelated: boolean;
  isGeneralEducation: boolean;
  medicationFallback: string | null;
}): string | undefined => {
  const isRefusal = rawReply === refusalText;

  if (isMedicationRelated && isRefusal) {
    return medicationFallback ?? rawReply;
  }

  if (!isGeneralEducation && !isRefusal) {
    return refusalText;
  }

  return rawReply;
};
