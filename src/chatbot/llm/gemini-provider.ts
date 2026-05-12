import { gemini } from "../utils/lib/gemini";
import { PatientContext } from "../types/patient";
import { normalizeGeminiResponse } from "./gemini-response.adapter";

type CompletionParams = {
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  language: string;
  refusalText: string;
  patientContext?: PatientContext;
  healthContext?: string;
};

// Inlined helpers from prompt-builder.ts
function getDiagnosisScope(patient?: PatientContext): string {
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
}

function formatPatientContext(patient?: PatientContext): string {
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
}

export async function createCompletion(
  model: string,
  params: CompletionParams,
) {
  const replyLanguage = params.language || "english";
  const res = await gemini.models.generateContent({
    model,
    contents: params.contents,
    config: {
      systemInstruction: buildPlainSystemPrompt(
        replyLanguage,
        params.refusalText,
        params.patientContext,
        params.healthContext,
      ),
      maxOutputTokens: 800,
      temperature: 0.2,
      responseMimeType: "text/plain",
    },
  });
  const { text, usageMetadata } = normalizeGeminiResponse(res);

  return {
    // `text` may be undefined when the upstream response has no usable text
    text: text ?? undefined,
    // Expose usage/metadata when available for downstream logging
    usageMetadata: usageMetadata as unknown,
  };
}

function buildPlainSystemPrompt(
  language: string,
  refusalText: string,
  patient?: PatientContext,
  healthContext?: string,
) {
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
- You MAY answer physical activity and exercise questions with safe, non-prescriptive general guidance.
- You MAY answer general health education questions about normal/reference values and definitions (for example: normal blood pressure or normal blood sugar), even if that condition is not listed in the patient's diagnosis. Keep these answers generic and non-prescriptive.
- You MAY answer general health education questions about blood pressure, blood sugar, cholesterol, and other common health topics for all users, even if they do not have a matching diagnosis. Do NOT give personalized treatment or prescription advice.
- Keep the tone warm, natural, and conversational. Avoid sounding robotic or overly scripted.
- Do not invent patient details, lab results, medications, or restrictions that were not provided.
- Do not greet the patient by name unless the name is explicitly present in the provided patient context.
- If no health education context was provided, do not mention or imply a guide, handout, document, or source text.
- Answer the user's question directly first. Keep the reply concise and practical.
- Do not provide personalized treatment advice for hypertension unless hypertension is explicitly present in the patient context.
- Do not provide personalized treatment advice for diabetes unless diabetes is explicitly present in the patient context.
- If the user's latest message contains an explicit language instruction (e.g., "Please answer in English" or "Palihog sabta sa Hiligaynon"), always follow that instruction for the reply language, even if the previous conversation was in another language.
- Always reply in the same language as the user's latest message, unless the user gives an explicit language instruction (e.g., "Please answer in English" or "Palihog sabta sa Hiligaynon"). If an explicit instruction is present, follow that instruction.
- If the patient asks for the meaning of a medical term related to their diagnosis, provide a simple definition.
- For normal/reference value questions, respond in 2-4 short sentences and include:
  - a plain-language definition of the metric
  - a typical adult reference range (if commonly known)
  - a brief, non-prescriptive note that ranges can vary by lab or individual
- Always respond in ${language}.

${formatPatientContext(patient)}
${getDiagnosisScope(patient)}

If the question is outside health education, or asks for diagnosis, prescription, or emergency medical instructions, reply with:
"${refusalText}"
`;
}
