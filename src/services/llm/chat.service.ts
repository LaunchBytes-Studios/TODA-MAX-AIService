import { isMedicationOrDosageQuestion } from "../../utils/keyword-utils";
import { gemini } from "../../utils/lib/gemini";
import {
  diabetesKeywordPatterns,
  foodKeywords,
  healthKeywordPatterns,
  hypertensionKeywordPatterns,
  mentionsKeyword,
} from "../../utils/lib/chat-keywords";
import {
  normalizeLanguage,
  detectMessageLanguage,
  getLocalizedText,
} from "../../utils/language-utils";
import { isNormalValueQuestion } from "../../utils/keyword-utils";
import {
  stripInventedGreeting,
  stripUnsupportedSourceClaims,
  stripUnsupportedConditionMentions,
} from "../../utils/post-processing";
import { SupportedLanguage } from "../../types/language";
type ChatRole = "patient" | "chatbot";
type GeminiAiRole = "user" | "model";
type ChatContent = string;

type ChatHistoryItem = {
  role: ChatRole;
  content: ChatContent;
};

export type PatientContext = {
  name?: string;
  age?: number;
  sex?: string;
  diagnosis?: Record<string, boolean> | null;
};

const roleMapping: Record<ChatRole, GeminiAiRole> = {
  patient: "user",
  chatbot: "model",
};
async function createCompletion(
  model: string,
  params: {
    contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
    language: string;
    refusalText: string;
    patientContext?: PatientContext;
    healthContext?: string;
  },
) {
  return gemini.models.generateContent({
    model,
    contents: params.contents,
    config: {
      systemInstruction: buildPlainSystemPrompt(
        params.language || "english",
        params.refusalText,
        params.patientContext,
        params.healthContext,
      ),
      maxOutputTokens: 800,
      temperature: 0.2,
      responseMimeType: "text/plain",
    },
  });
}
const formatPatientContext = (patient?: PatientContext): string => {
  if (!patient) {
    return "";
  }

  const lines: string[] = [];
  if (patient.name) {
    lines.push(`Name: ${patient.name}`);
  }
  if (typeof patient.age === "number") {
    lines.push(`Age: ${patient.age}`);
  }
  if (patient.sex) {
    lines.push(`Sex: ${patient.sex}`);
  }
  if (patient.diagnosis) {
    lines.push(`Diagnosis: ${JSON.stringify(patient.diagnosis)}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `Patient context (use for personalization only; do not assume new facts):\n${lines.join("\n")}`;
};

const modelsToTry = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
];

const isHealthRelatedMessage = (message: string): boolean => {
  return mentionsKeyword(message, healthKeywordPatterns);
};

const isFoodRelatedMessage = (message: string): boolean => {
  return mentionsKeyword(message, foodKeywords);
};

const asksAboutUnsupportedDiagnosis = (
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

const buildConversationContext = (
  message: string,
  history: ChatHistoryItem[],
): string => {
  const recentHistory = normalizeHistory(history)
    .map((item) => item.content)
    .join(" ");

  return `${recentHistory} ${message}`.trim();
};

const hasSupportedDiagnosis = (patient?: PatientContext): boolean => {
  if (!patient?.diagnosis) {
    return false;
  }

  return Boolean(patient.diagnosis.diabetes || patient.diagnosis.hypertension);
};

const getDiagnosisScope = (patient?: PatientContext): string => {
  const diagnoses: string[] = [];

  if (patient?.diagnosis?.diabetes) {
    diagnoses.push("diabetes");
  }
  if (patient?.diagnosis?.hypertension) {
    diagnoses.push("hypertension");
  }

  if (diagnoses.length === 0) {
    return "No supported diagnosis was provided.";
  }

  return `Supported diagnosis context for this patient: ${diagnoses.join(" and ")}.`;
};

const buildPlainSystemPrompt = (
  language: string,
  refusalText: string,
  patient?: PatientContext,
  healthContext?: string,
) => {
  const normalizedHealthContext = healthContext?.trim();
  return `
You are Max, a healthcare assistant chatbot.

Use only the provided health education context and known patient context when answering.

${
  normalizedHealthContext
    ? `Additional health education context:\n${normalizedHealthContext}`
    : ""
}

Rules:
- Do NOT diagnose new medical conditions.
- You MAY restate known diagnoses from the provided patient context.
- Do NOT prescribe medication.
- Do NOT provide emergency medical advice.
- Provide general health education for diabetes or hypertension if the patient has those diagnoses.
- You MAY define terms (like “hypoglycemia” or “high blood pressure”) if they are relevant to the patient’s diagnosis.
- If the patient has a known diagnosis of diabetes or hypertension, you may answer diet and food questions with safe, non-prescriptive guidance.
- Keep the tone warm, natural, and conversational. Avoid sounding robotic or overly scripted.
- Do not invent patient details, lab results, medications, or restrictions that were not provided.
- Do not greet the patient by name unless the name is explicitly present in the provided patient context.
- If no health education context was provided, do not mention or imply a guide, handout, document, or source text.
- Answer the user's question directly first. Keep the reply concise and practical.
- Do not provide advice for hypertension unless hypertension is explicitly present in the patient context.
- Do not provide advice for diabetes unless diabetes is explicitly present in the patient context.
- If the user's latest message contains an explicit language instruction (e.g., "Please answer in English" or "Palihog sabta sa Hiligaynon"), always follow that instruction for the reply language, even if the previous conversation was in another language.
- Always reply in the same language as the user's latest message, unless the user gives an explicit language instruction (e.g., "Please answer in English" or "Palihog sabta sa Hiligaynon"). If an explicit instruction is present, follow that instruction.
- If the patient asks for the meaning of a medical term related to their diagnosis, provide a simple definition.
- Always respond in ${language}.

${formatPatientContext(patient)}
${getDiagnosisScope(patient)}

If the question is not related to diabetes or hypertension (when those are the patient’s diagnoses), reply with:
"${refusalText}"
`;
};

const normalizeHistory = (history: ChatHistoryItem[]): ChatHistoryItem[] => {
  return history
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content)
    .slice(-3);
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
  // Detect language from the latest message if not provided
  const detectedLanguage = language
    ? requestedLanguage
    : detectMessageLanguage(cleanMessage, language);

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
  const refusalText = getLocalizedText("refusal", detectedLanguage);
  const unsupportedDiagnosisText = getLocalizedText(
    "unsupported",
    detectedLanguage,
  );
  const busyText = getLocalizedText("busy", detectedLanguage);
  const mappedHistory = safeHistory.map((item) => ({
    role: roleMapping[item.role],
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
    console.log("[AIService] detectedLanguage:", detectedLanguage);
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
      detected_language: detectedLanguage,
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
          language: detectedLanguage,
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
          detected_language: detectedLanguage,
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

  if (!completion) {
    const finalStatus = getUpstreamStatus(lastError);
    if (finalStatus === 429 || finalStatus === 503) {
      return {
        reply: busyText,
        chatbot_active: false,
        detected_language: detectedLanguage,
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
    detected_language: detectedLanguage,
    usage: completion.usageMetadata,
  };
};
