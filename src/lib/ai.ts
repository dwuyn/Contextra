import { createOpenAI } from "@ai-sdk/openai";

const baseURL = process.env.OPENAI_BASE_URL || "https://lulu-heartbroken-katina.ngrok-free.dev/v1";
const apiKey = process.env.OPENAI_API_KEY || "sk-not-needed-for-local";

export const customAi = createOpenAI({
  baseURL,
  apiKey,
});
