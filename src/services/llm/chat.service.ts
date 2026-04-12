import { openai } from "../../utils/lib/openai";

type ChatRole = "patient" | "chatbot";
type OpenAiRole = "user" | "assistant";
type ChatContent = string;

type ChatHistoryItem = {
  role: ChatRole;
  content: ChatContent;
};

type PatientContext = {
  name?: string;
  age?: number;
  sex?: string;
  diagnosis?: JSON | null;
};

const roleMapping: Record<ChatRole, OpenAiRole> = {
  patient: "user",
  chatbot: "assistant",
};

const modules = `
Hypertension is a condition where blood pressure is consistently too high.
It may increase the risk of heart disease and stroke.

Common lifestyle guidance for hypertension includes reducing sodium, limiting alcohol,
maintaining a healthy weight, and regular physical activity. Common medication classes
prescribed by clinicians include ACE inhibitors, ARBs, calcium channel blockers,
and thiazide diuretics. Patients should follow a clinician's guidance for any medication.

Diabetes is a chronic condition where blood sugar levels are elevated.
It can be managed through proper diet, exercise, and medication under medical supervision.

General nutrition guidance for diabetes includes focusing on non-starchy vegetables,
lean proteins, whole grains in appropriate portions, legumes, nuts, and unsweetened beverages,
while limiting sugary drinks, refined carbs, and highly processed snacks. Meal plans should be
individualized by a clinician or dietitian.`;

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

const buildSystemPrompt = (language: string, patient?: PatientContext) => `
You are Max, a healthcare assistant chatbot.

Use ONLY the health information below when answering:

${modules}

Rules:
- Do NOT diagnose new medical conditions.
- You MAY restate known diagnoses from the provided patient context.
- Do NOT prescribe medication.
- Do NOT provide emergency medical advice.
- Provide general health education only.
- If the question is outside the provided health information, set out_of_scope=true.
- If you are unsure, set out_of_scope=true.
- Always respond in ${language}.

${formatPatientContext(patient)}

Set chatbot_active=false when the question is outside the provided health information. Otherwise chatbot_active=true.
if the chatbot_active=false, the reply should be "Sorry, I cannot answer that question. Please wait for the eNavigator  to assist you."
Return ONLY valid JSON in this format:
{
  "reply": string,
  "chatbot_active": boolean
}
`;

const normalizeHistory = (history: ChatHistoryItem[]): ChatHistoryItem[] => {
  return history
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content)
    .slice(-6);
};

export const generateChatReply = async (
  message: ChatContent,
  language?: string,
  history?: ChatHistoryItem[],
  patientContext?: PatientContext,
): Promise<{ reply: ChatContent; chatbot_active: boolean; usage: unknown }> => {
  const cleanMessage = message.trim();
  const safeHistory = normalizeHistory(history || []);
  const mappedHistory = safeHistory.map((item) => ({
    role: roleMapping[item.role],
    content: item.content,
  }));
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(language || "English", patientContext),
      },
      ...mappedHistory,
      {
        role: "user",
        content: cleanMessage,
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content?.trim();
  const fallback = {
    reply: rawContent || "Sorry, I couldn't generate a response.",
    chatbot_active: true,
  };

  let parsed = fallback;
  if (rawContent) {
    try {
      const asJson = JSON.parse(rawContent) as {
        reply?: string;
        chatbot_active?: boolean;
      };
      parsed = {
        reply: typeof asJson.reply === "string" ? asJson.reply : fallback.reply,
        chatbot_active:
          typeof asJson.chatbot_active === "boolean"
            ? asJson.chatbot_active
            : fallback.chatbot_active,
      };
    } catch {
      parsed = fallback;
    }
  }

  return { ...parsed, usage: completion.usage };
};
