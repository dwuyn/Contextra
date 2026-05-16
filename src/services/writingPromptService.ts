import type { PromptContext } from "@/services/contextService";

function buildBulletedList(items: string[], emptyMessage: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${emptyMessage}`;
}

function buildRecentSummaryBlock(context: PromptContext) {
  return context.recentChapterSummaries.length
    ? context.recentChapterSummaries
        .map(({ chapterTitle, summary }) => `- ${chapterTitle}: ${summary}`)
        .join("\n")
    : "- No recent summarized chapters yet.";
}

function buildContinuityContextBlock(context: PromptContext) {
  const sharedNotes = context.sharedNotes.trim() || "No shared notes yet.";
  const worldRules = buildBulletedList(context.worldRules, "No world rules yet.");
  const branchHighlights = buildBulletedList(context.branchHighlights, "No branch highlights yet.");
  const ragContext = context.ragContext.length ? context.ragContext.join("\n\n") : "No relevant past scenes found.";

  return `
[STORY BIBLE]
Project: ${context.projectName}
Summary: ${context.projectSummary}
Shared Notes: ${sharedNotes}
Tone: ${context.tone}
Audience: ${context.audience}

[WORLD RULES]
${worldRules}

[CHARACTERS]
${context.characterDigest}

[BRANCH CONTEXT]
Current Branch: ${context.branchName}
Branch Description: ${context.branchDescription || "No branch description yet."}
Branch Highlights:
${branchHighlights}

[RECENT CHAPTER SUMMARIES]
${buildRecentSummaryBlock(context)}

[RETRIEVED PAST CONTEXT]
${ragContext}

[RECENT PROSE]
...
${context.slidingWindowText}
...
`.trim();
}

export function buildChatSystemPrompt(context: PromptContext) {
  return `
You are an expert creative writing assistant helping the user write "${context.projectName}".

${buildContinuityContextBlock(context)}

Guidelines:
- Treat the supplied Story Bible, character memory, recent summaries, and prose as canon unless the user explicitly changes them.
- Be helpful, creative, and continuity-aware.
- If asked to brainstorm, provide vivid and specific options grounded in the supplied context.
- If asked about the world or characters, answer from the provided context before inventing new facts.
- Keep responses concise but engaging.
`.trim();
}

export function buildChapterGenerationPrompt(
  input: { title: string; instructions: string },
  context: PromptContext,
) {
  return `
You are an expert long-form writing assistant.

${buildContinuityContextBlock(context)}

[CURRENT TASK]
Requested chapter title: ${input.title}
Instructions:
${input.instructions}

Return only valid JSON with:
- title
- summary
- content

Requirements:
- Keep continuity strictly aligned with the supplied context.
- Use the shared notes, world rules, characters, and recent summaries when resolving long-form continuity.
- content must be clean HTML using paragraphs and simple inline tags when needed.
`.trim();
}

export function buildRewritePrompt(
  input: { selection: string; instructions: string },
  context: PromptContext,
) {
  return `
You are an expert editor.

${buildContinuityContextBlock(context)}

[CURRENT TASK]
Selection to rewrite:
"${input.selection}"

Instructions:
${input.instructions}

Requirements:
- Preserve continuity with the supplied story context.
- Return only the rewritten text.
- Do not add conversational filler or markdown.
`.trim();
}

export function buildDescribePrompt(
  input: { selection: string; sense: string },
  context: PromptContext,
) {
  return `
You are an expert sensory writer.

${buildContinuityContextBlock(context)}

[CURRENT TASK]
Word or phrase to expand:
"${input.selection}"

Primary sense to emphasize: ${input.sense}

Requirements:
- Stay consistent with the supplied story context.
- Provide a few atmospheric and vivid sentences.
- Return only the text with no conversational filler or markdown.
`.trim();
}
