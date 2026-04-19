import { gemini } from "../utils/lib/gemini";
import { PatientContext } from "../types/patient";

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
}
