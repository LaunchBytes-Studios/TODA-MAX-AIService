import { Request, Response } from "express";
import { z } from "zod";
import { generateChatReply } from "../services/llm/chat.service";

const chatSchema = z.object({
  message: z.string().trim().min(2).max(1000),
  language: z.string().trim().max(100).optional(),
  history: z.array(z.any()).optional(),
  health_context: z.string().trim().max(8000).optional(),
  patient_context: z
    .object({
      name: z.string().trim().max(200).optional(),
      age: z.number().int().min(1).max(130).optional(),
      sex: z.string().trim().max(50).optional(),
      diagnosis: z.record(z.string(), z.boolean()).optional(),
    })
    .optional(),
});

export const chat = async (req: Request, res: Response) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { message, language, history, patient_context, health_context } =
      parsed.data;

    const result = await generateChatReply(
      message,
      language,
      history,
      patient_context,
      health_context,
    );

    console.log("Token usage:", result.usage);
    return res.json({
      reply: result.reply,
      chatbot_active: result.chatbot_active,
    });
  } catch (error) {
    console.error(error);
    const upstreamStatus =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    const message =
      upstreamStatus === 429
        ? "Gemini quota exceeded or rate limited. Please try again later."
        : upstreamStatus === 503
          ? "Gemini is experiencing high demand. Please try again later."
          : "Something went wrong";

    return res.status(upstreamStatus).json({ error: message });
  }
};
