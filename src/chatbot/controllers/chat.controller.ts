import { Request, Response } from "express";
import { z } from "zod";
import { generateChatReply } from "../llm/chat.service";

// Request validation schema for the chat endpoint. Keeping this strict
// helps the controller reject malformed requests before business logic.
const chatSchema = z.object({
  // Strict request shape — fail early on bad payloads.
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
    // Validate the request and pass the cleaned payload to the chat service.
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { message, language, history, patient_context, health_context } =
      parsed.data;
    console.log("[AIService] Calling generateChatReply...");
    const result = await generateChatReply(
      message,
      language,
      history,
      patient_context,
      health_context,
    );
    // log the result here while I am still debugging the chat flow.
    console.log("[AIService] generateChatReply finished:", result);
    console.log("Token usage:", result.usage);
    return res.json({
      reply: result.reply,
      chatbot_active: result.chatbot_active,
      detected_language: result.detected_language,
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
