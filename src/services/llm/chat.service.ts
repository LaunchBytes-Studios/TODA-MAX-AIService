import { gemini } from "../../utils/lib/gemini";

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
    return "Pasensya, indi ko masabat imo pamangkot. Palihog hulat sa eNavigator para mabuligan yaka..";
  }
  if (normalized === "filipino" || normalized === "tagalog") {
    return "Paumanhin, hindi ko masasagot ang tanong mo. Mangyaring maghintay sa eNavigator para sa tulong.";
  }
  if (normalized === "bisaya") {
    return "Pasensya, dili ko makatubag sa imong pangutana. Palihug hulat sa eNavigator para sa tabang.";
  }
  return DEFAULT_REFUSAL_TEXT;
};

const modelsToTry = [
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

const healthKeywordPatterns = [
  "diabetes",
  "hypertension",
  "high blood pressure",
  "blood pressure",
  "bp",
  "blood sugar",
  "glucose",
  "insulin",
  "hypoglycemia",
  "hyperglycemia",
  "hypertensive",
];

const isHealthRelatedMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return healthKeywordPatterns.some((keyword) => normalized.includes(keyword));
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

Use ONLY the health information below when answering:



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
- Provide general health education  related to hypertension or diabetes only.
- Always respond in ${language}.

${formatPatientContext(patient)}

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
  const isHealthRelated = isHealthRelatedMessage(cleanMessage);
  const refusalText = getRefusalText(language || "English");
  const safeHistory = normalizeHistory(history || []);
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
  ]; // 4. Use const for contents

  let completion = null as Awaited<ReturnType<typeof createCompletion>> | null;
  let lastError: unknown;

  for (const model of modelsToTry) {
    try {
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
      if (status === 404 || status === 429 || status === 503) {
        continue;
      }
      throw error;
    }
  }

  if (!completion) {
    throw lastError ?? new Error("Failed to generate completion");
  }

  const reply = completion.text?.trim();
  const isRefusal = reply === refusalText;
  const finalReply = !isHealthRelated && !isRefusal ? refusalText : reply;
  return {
    reply: finalReply || "Sorry, I couldn't generate a response.",
    chatbot_active: !isRefusal && isHealthRelated,
    usage: completion.usageMetadata,
  };
};
