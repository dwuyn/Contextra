import { customAi } from "@/lib/ai";
import { generateText } from "ai";
import { PromptContext } from "./contextService";

function stripReasoning(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export async function generateChapter(input: { title: string; instructions: string }, context: PromptContext) {
  const prompt = buildPrompt(input, context);

  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
 // The model name depends on the custom endpoint, often ignored or mapped
    prompt,
    temperature: 0.8,
  });

  const cleanText = stripReasoning(text);

  try {
    const json = JSON.parse(cleanText);
    return {
      title: json.title || input.title,
      summary: json.summary || "",
      content: json.content || "",
      tokens: 0, // AI SDK provides usage, but let's keep it simple for now
      costUsd: 0,
      model: "custom-ai",
    };
  } catch (err) {
    console.error("Failed to parse AI response:", cleanText, err);
    throw new Error("AI returned invalid JSON. Please try again.");
  }
}

export async function rewriteSelection(input: { selection: string; instructions: string }, context: PromptContext) {
  const prompt = `
You are an expert editor. 
Project Tone: ${context.tone}
Project Audience: ${context.audience}

Current selection to rewrite:
"${input.selection}"

Instructions for rewriting:
${input.instructions}

Return only the rewritten text. No conversational filler.
`.trim();

  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt,
  });

  return stripReasoning(text);
}

export async function describeSelection(input: { selection: string; sense: string }, context: PromptContext) {
  const prompt = `
You are an expert sensory writer.
Project Tone: ${context.tone}

Word/Phrase to describe: "${input.selection}"
Focus on the sense of: ${input.sense}

Provide a few atmospheric and vivid sentences expanding on this description.
Return only the text. No conversational filler.
`.trim();

  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt,
  });

  return stripReasoning(text);
}

export async function chatWithAi(messages: { role: string; content: string }[], context: PromptContext) {
  const ragContextBlock = context.ragContext.length ? context.ragContext.join("\n\n") : "No relevant past scenes found.";

  const systemPrompt = `
You are an expert creative writing assistant helping the user write "${context.projectName}".

[STORY STATE]
- Summary: ${context.projectSummary}
- Tone: ${context.tone}
- Audience: ${context.audience}

[RULES / LORE]
- ${context.worldRules.join("\n- ")}

[BRANCH CONTEXT]
- Current Branch: ${context.branchName}
- Branch Description: ${context.branchDescription}

[RETRIEVED PAST CONTEXT]
${ragContextBlock}

[RECENT PROSE]
...
${context.slidingWindowText}
...

Guidelines:
- Be helpful, creative, and strictly adhere to the project's tone and continuity.
- If asked about the world or characters, refer to the provided context.
- Keep responses concise but engaging.
`.trim();

  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    system: systemPrompt,
    messages: messages as any,
  });

  return stripReasoning(text);
}

function buildPrompt(input: { title: string; instructions: string }, context: PromptContext) {
  const worldRules = context.worldRules.length ? context.worldRules.join("\n- ") : "No world rules yet.";
  const ragContextBlock = context.ragContext.length ? context.ragContext.join("\n\n") : "No relevant past scenes found.";
  const branchHighlights = context.branchHighlights.length ? context.branchHighlights.join("\n- ") : "No branch highlights yet.";

  return `
[STORY STATE]
Project: ${context.projectName}
Summary: ${context.projectSummary}
Tone: ${context.tone}
Audience: ${context.audience}

[RULES / LORE]
- ${worldRules}

[CHARACTERS]
${context.characterDigest}

[RETRIEVED PAST CONTEXT]
${ragContextBlock}

[RECENT PROSE (SLIDING WINDOW)]
...
${context.slidingWindowText}
...

[CURRENT TASK]
Requested chapter title: ${input.title}
Instructions:
${input.instructions}

You are an expert long-form writing assistant.
Return only valid JSON with:
- title
- summary
- content

Requirements:
- Keep continuity strictly aligned with the supplied context.
- content must be clean HTML using paragraphs and simple inline tags when needed.
`.trim();
}
