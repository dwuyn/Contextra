import type { PromptContext } from "@/services/contextService";
import {
  buildRecentSummaryLanguageSignal,
  buildResponseLanguageInstruction,
} from "@/services/promptLanguageService";

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

function buildStoryLanguageSignals(context: PromptContext) {
  return [
    { label: "story bible summary", text: context.projectSummary },
    { label: "shared notes", text: context.sharedNotes },
    buildRecentSummaryLanguageSignal(context.recentChapterSummaries),
    { label: "project title", text: context.projectName },
    { label: "branch title", text: context.branchName },
    { label: "character memory", text: context.characterDigest },
  ];
}

export function buildChatSystemPrompt(context: PromptContext, latestUserMessage: string) {
  const languageInstruction = buildResponseLanguageInstruction({
    taskSignals: [{ label: "latest user message", text: latestUserMessage }],
    storySignals: buildStoryLanguageSignals(context),
  });

  return `
You are an expert creative writing assistant helping the user write "${context.projectName}".

${languageInstruction}

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
  const languageInstruction = buildResponseLanguageInstruction({
    taskSignals: [
      { label: "current instructions", text: input.instructions },
      { label: "requested chapter title", text: input.title },
    ],
    storySignals: buildStoryLanguageSignals(context),
  });

  return `
You are an expert long-form writing assistant.

${languageInstruction}

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
  const languageInstruction = buildResponseLanguageInstruction({
    taskSignals: [
      { label: "selected text", text: input.selection },
      { label: "rewrite instructions", text: input.instructions },
    ],
    storySignals: buildStoryLanguageSignals(context),
  });

  return `
You are an expert editor.

${languageInstruction}

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
  const languageInstruction = buildResponseLanguageInstruction({
    taskSignals: [
      { label: "selected text", text: input.selection },
      { label: "sense request", text: input.sense },
    ],
    storySignals: buildStoryLanguageSignals(context),
  });

  return `
You are an expert sensory writer.

${languageInstruction}

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
