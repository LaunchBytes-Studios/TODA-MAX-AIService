import { gemini } from "../../utils/lib/gemini";
import {
  diabetesKeywordPatterns,
  foodKeywords,
  healthKeywordPatterns,
  hypertensionKeywordPatterns,
  mentionsKeyword,
} from "../../utils/lib/chat-keywords";
type ChatRole = "patient" | "chatbot";
type GeminiAiRole = "user" | "model";
type ChatContent = string;

type ChatHistoryItem = {
  role: ChatRole;
  content: ChatContent;
};

type PatientContext = {
  name?: string;
  age?: number;
  sex?: string;
  diagnosis?: Record<string, boolean> | null;
};

const roleMapping: Record<ChatRole, GeminiAiRole> = {
  patient: "user",
  chatbot: "model",
};

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

const DEFAULT_REFUSAL_TEXT =
  "Sorry, I cannot answer that question. Please wait for the eNavigator to assist you.";

const getRefusalText = (language: string) => {
  const normalized = language.trim().toLowerCase();
  if (normalized === "hiligaynon" || normalized === "ilonggo") {
    return "Pasensya, indi ko masabat imo pamangkot. Palihog hulat sa eNavigator para mabuligan ka.";
  }
  if (normalized === "filipino" || normalized === "tagalog") {
    return "Paumanhin, hindi ko masasagot ang tanong mo. Mangyaring maghintay sa eNavigator para sa tulong.";
  }
  if (normalized === "bisaya") {
    return "Pasensya, dili ko makatubag sa imong pangutana. Palihug hulat sa eNavigator para sa tabang.";
  }
  return DEFAULT_REFUSAL_TEXT;
};

const getUnsupportedDiagnosisText = (language: string) => {
  const normalized = language.trim().toLowerCase();
  if (normalized === "hiligaynon" || normalized === "ilonggo") {
    return "Pasensya, indi ko masabat ina kay wala ini sa diagnosis nga ginhatag para sa imo. Palihog hulat sa eNavigator para mabuligan ka.";
  }
  if (normalized === "filipino" || normalized === "tagalog") {
    return "Paumanhin, hindi ko masasagot iyan dahil wala ito sa diagnosis na ibinigay para sa iyo. Mangyaring maghintay sa eNavigator para sa tulong.";
  }
  if (normalized === "bisaya") {
    return "Pasensya, dili ko makatubag ana kay wala kini sa diagnosis nga gihatag para nimo. Palihug hulat sa eNavigator para sa tabang.";
  }
  return "Sorry, I cannot answer that because it is outside the diagnosis provided for you. Please wait for the eNavigator to assist you.";
};

const getBusyText = (language: string) => {
  const normalized = language.trim().toLowerCase();
  if (normalized === "hiligaynon" || normalized === "ilonggo") {
    return "Pasensya, madamo subong ang nagagamit sang AI assistant. Palihog liwat anay sa makadiyot.";
  }
  if (normalized === "filipino" || normalized === "tagalog") {
    return "Paumanhin, maraming gumagamit ng AI assistant ngayon. Pakisubukang muli maya-maya.";
  }
  if (normalized === "bisaya") {
    return "Pasensya, daghan nagagamit sa AI assistant karon. Palihug sulayi balik unya.";
  }
  return "Sorry, the AI assistant is busy right now. Please try again shortly.";
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
- Provide general health education related only to the supported diagnoses explicitly present in the patient context.
- If the patient has a known diagnosis of diabetes or hypertension, you may answer diet and food questions with safe, non-prescriptive guidance.
- Keep the tone warm, natural, and conversational. Avoid sounding robotic or overly scripted.
- Do not invent patient details, lab results, medications, or restrictions that were not provided.
- Do not greet the patient by name unless the name is explicitly present in the provided patient context.
- If no health education context was provided, do not mention or imply a guide, handout, document, or source text.
- Answer the user's question directly first. Keep the reply concise and practical.
- Do not provide advice for hypertension unless hypertension is explicitly present in the patient context.
- Do not provide advice for diabetes unless diabetes is explicitly present in the patient context.
- Always respond in ${language}.

${formatPatientContext(patient)}
${getDiagnosisScope(patient)}

If the question is outside the provided health information, reply with:
"${refusalText}"
`;
};

const normalizeHistory = (history: ChatHistoryItem[]): ChatHistoryItem[] => {
  return history
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content)
    .slice(-6);
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

const stripInventedGreeting = (
  reply: string,
  patient?: PatientContext,
): string => {
  if (patient?.name) {
    return reply;
  }

  return reply.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[!,.]?\s*/i, "");
};

const stripUnsupportedSourceClaims = (
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

const stripUnsupportedConditionMentions = (
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

const createCompletion = async (
  model: string,
  params: {
    contents: Array<{ role: GeminiAiRole; parts: Array<{ text: string }> }>;
    language: string;
    refusalText: string;
    patientContext?: PatientContext;
    healthContext?: string;
  },
) => {
  return gemini.models.generateContent({
    model,
    contents: params.contents,
    config: {
      systemInstruction: buildPlainSystemPrompt(
        params.language || "English",
        params.refusalText,
        params.patientContext,
        params.healthContext,
      ),
      maxOutputTokens: 1500,
      temperature: 0.2,
      responseMimeType: "text/plain",
    },
  });
};

export const generateChatReply = async (
  message: ChatContent,
  language?: string,
  history?: ChatHistoryItem[],
  patientContext?: PatientContext,
  healthContext?: string,
): Promise<{ reply: ChatContent; chatbot_active: boolean; usage: unknown }> => {
  const cleanMessage = message.trim();
  const safeHistory = normalizeHistory(history || []);
  const conversationContext = buildConversationContext(
    cleanMessage,
    safeHistory,
  );
  const hasDiagnosisContext = hasSupportedDiagnosis(patientContext);
  const isFoodRelated = isFoodRelatedMessage(conversationContext);
  const isHealthRelated =
    isHealthRelatedMessage(conversationContext) ||
    (isFoodRelated && hasDiagnosisContext);
  const asksUnsupportedDiagnosis = asksAboutUnsupportedDiagnosis(
    cleanMessage,
    patientContext,
  );
  const refusalText = getRefusalText(language || "English");
  const unsupportedDiagnosisText = getUnsupportedDiagnosisText(
    language || "English",
  );
  const busyText = getBusyText(language || "English");
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
    console.log("[AIService] conversationContext:", conversationContext);
  }

  if (asksUnsupportedDiagnosis) {
    return {
      reply: unsupportedDiagnosisText,
      chatbot_active: false,
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
      completion = await createCompletion(model, {
        contents,
        language: language || "English",
        refusalText,
        patientContext,
        healthContext,
      });
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
  return {
    reply: finalReply || "Sorry, I couldn't generate a response.",
    chatbot_active: !isRefusal && isHealthRelated,
    usage: completion.usageMetadata,
  };
};
