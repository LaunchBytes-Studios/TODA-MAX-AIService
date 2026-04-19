import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env["GEMINI_API_KEY"];

if (!apiKey) {
  throw new Error(
    "Missing GEMINI_API_KEY. Add it to your environment or .env before starting the AI service.",
  );
}

export const gemini = new GoogleGenAI({ apiKey });
