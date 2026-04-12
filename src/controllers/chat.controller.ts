import { Request, Response } from "express";
import { z } from "zod";
import { generateChatReply } from "../services/llm/chat.service";

const chatSchema = z.object({
  message: z.string().trim().min(2).max(1000),
  language: z.string().trim().max(100).optional(),
  history: z.array(z.any()).optional(),
  patient_context: z
    .object({
      name: z.string().trim().max(200).optional(),
      age: z.number().int().min(0).max(130).optional(),
      sex: z.string().trim().max(50).optional(),
      diagnosis: z.any().optional(),
    })
    .optional(),
});

export const chat = async (req: Request, res: Response) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { message, language, history, patient_context } = parsed.data;

    const result = await generateChatReply(
      message,
      language,
      history,
      patient_context,
    );

    console.log("Token usage:", result.usage);
    return res.json({
      reply: result.reply,
      chatbot_active: result.chatbot_active,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
