import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env["OPENAI_API_KEY"];

if (!apiKey) {
  throw new Error(
    "Missing OPENAI_API_KEY. Add it to your environment or .env before starting the AI service.",
  );
}

export const openai = new OpenAI({
  apiKey,
});
