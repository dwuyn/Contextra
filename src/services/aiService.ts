import { customAi } from "@/lib/ai";
import * as z from "@/lib/validations";
import { generateText } from "ai";
import type { ModelMessage } from "ai";
import type { PromptContext } from "./contextService";
import {
  buildChapterGenerationPrompt,
  buildChatSystemPrompt,
  buildDescribePrompt,
  buildRewritePrompt,
} from "./writingPromptService";
import {
  buildResponseLanguageInstruction,
  extractLatestUserText,
} from "./promptLanguageService";

function stripReasoning(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/u, "$1")
    .trim();
}

export type StoryBibleGenerationContext = {
  projectName: string;
  braindump: string;
  genre: string;
  tone: string;
  audience: string;
  synopsis: string;
  worldRules: string[];
  characters: Array<{ name: string; role: string; memory: string }>;
  chapters: Array<{ title: string; summary: string }>;
};

const LONG_OUTLINE_SEGMENT_SIZE = 200;
type GeneratedLongOutline = ReturnType<typeof z.GeneratedLongOutlineSchema.parse>;
type GeneratedLongOutlineArc = GeneratedLongOutline["arcs"][number];

export async function generateChapter(input: { title: string; instructions: string }, context: PromptContext) {
  const prompt = buildChapterGenerationPrompt(input, context);

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
  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt: buildRewritePrompt(input, context),
  });

  return stripReasoning(text);
}

export async function describeSelection(input: { selection: string; sense: string }, context: PromptContext) {
  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt: buildDescribePrompt(input, context),
  });

  return stripReasoning(text);
}

export async function generateSynopsisFromStoryBible(context: StoryBibleGenerationContext) {
  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt: buildSynopsisPrompt(context),
    temperature: 0.6,
  });

  return {
    synopsis: stripReasoning(text),
    tokens: 0,
    costUsd: 0,
    model: "custom-ai",
  };
}

export async function generateOutlineFromStoryBible(context: StoryBibleGenerationContext) {
  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt: buildOutlinePrompt(context),
    temperature: 0.7,
  });

  const cleanText = stripReasoning(text);

  try {
    const json = JSON.parse(cleanText);
    const outline = z.GeneratedOutlineSchema.parse(json);
    return {
      outline,
      tokens: 0,
      costUsd: 0,
      model: "custom-ai",
    };
  } catch (err) {
    console.error("Failed to parse outline JSON:", cleanText, err);
    throw new Error("AI returned an invalid outline. Please try again.");
  }
}

export async function generateLongOutlineFromStoryBible(context: StoryBibleGenerationContext, targetChapterCount: number) {
  const arcs: GeneratedLongOutlineArc[] = [];

  for (let start = 1; start <= targetChapterCount; start += LONG_OUTLINE_SEGMENT_SIZE) {
    const end = Math.min(start + LONG_OUTLINE_SEGMENT_SIZE - 1, targetChapterCount);
    const previousArcDigest = arcs
      .slice(-5)
      .map((arc) => `${arc.title} (${arc.startChapterIndex}-${arc.endChapterIndex}): ${arc.summary}`)
      .join("\n");

    const segment = await generateLongOutlineSegment(context, targetChapterCount, start, end, previousArcDigest);
    arcs.push(...segment.arcs);
  }

  return {
    outline: { arcs },
    tokens: 0,
    costUsd: 0,
    model: "custom-ai",
  };
}

async function generateLongOutlineSegment(
  context: StoryBibleGenerationContext,
  targetChapterCount: number,
  segmentStart: number,
  segmentEnd: number,
  previousArcDigest: string,
) {
  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt: buildLongOutlinePrompt(context, targetChapterCount, segmentStart, segmentEnd, previousArcDigest),
    temperature: 0.6,
  });

  const cleanText = stripReasoning(text);

  try {
    const json = JSON.parse(cleanText);
    const outline = z.GeneratedLongOutlineSchema.parse(json);
    return normalizeLongOutlineSegment(outline, segmentStart, segmentEnd);
  } catch (err) {
    console.error("Failed to parse long outline JSON:", cleanText, err);
    throw new Error("AI returned an invalid long outline. Please try again.");
  }
}

function normalizeLongOutlineSegment(
  outline: GeneratedLongOutline,
  segmentStart: number,
  segmentEnd: number,
): GeneratedLongOutline {
  return {
    arcs: outline.arcs
      .map((arc) => ({
        ...arc,
        startChapterIndex: Math.max(segmentStart, arc.startChapterIndex),
        endChapterIndex: Math.min(segmentEnd, arc.endChapterIndex),
        beats: arc.beats.filter(
          (beat) => beat.chapterIndex >= segmentStart && beat.chapterIndex <= segmentEnd,
        ),
      }))
      .filter((arc) => arc.startChapterIndex <= arc.endChapterIndex),
  };
}

export async function chatWithAi(messages: ModelMessage[], context: PromptContext) {
  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    system: buildChatSystemPrompt(context, extractLatestUserText(messages)),
    messages,
  });

  return stripReasoning(text);
}

function buildSynopsisPrompt(context: StoryBibleGenerationContext) {
  const worldRules = context.worldRules.length ? context.worldRules.map((rule) => `- ${rule}`).join("\n") : "- No world rules yet.";
  const characters = context.characters.length
    ? context.characters.map((character) => `- ${character.name} (${character.role}): ${character.memory}`).join("\n")
    : "- No characters defined yet.";
  const chapterDigest = context.chapters.length
    ? context.chapters
        .map((chapter, index) => `- Chapter ${index + 1}: ${chapter.title}${chapter.summary ? ` | ${chapter.summary}` : ""}`)
        .join("\n")
    : "- No chapters yet.";
  const languageInstruction = buildResponseLanguageInstruction({
    taskSignals: [],
    storySignals: [
      { label: "braindump", text: context.braindump },
      { label: "existing synopsis", text: context.synopsis },
      {
        label: "chapter titles and summaries",
        text: context.chapters.map((chapter) => `${chapter.title} ${chapter.summary}`.trim()).join("\n"),
      },
      { label: "project title", text: context.projectName },
      {
        label: "character memory",
        text: context.characters.map((character) => `${character.name} ${character.role} ${character.memory}`.trim()).join("\n"),
      },
    ],
  });

  return `
You are an expert developmental editor creating a story synopsis for a writing project.

${languageInstruction}

[PROJECT]
Title: ${context.projectName}
Genre: ${context.genre}
Tone: ${context.tone}
Audience: ${context.audience}

[BRAINDUMP]
${context.braindump || "No braindump yet."}

[EXISTING SYNOPSIS]
${context.synopsis || "No synopsis yet."}

[CHARACTERS]
${characters}

[WORLD RULES]
${worldRules}

[REAL CHAPTERS]
${chapterDigest}

Write a polished synopsis that:
- introduces the protagonist(s), central conflict, stakes, and tone
- stays consistent with the supplied project information
- is useful as future reference for writing

Return only the synopsis text. No markdown, no heading, no commentary.
`.trim();
}

function buildOutlinePrompt(context: StoryBibleGenerationContext) {
  const worldRules = context.worldRules.length ? context.worldRules.map((rule) => `- ${rule}`).join("\n") : "- No world rules yet.";
  const characters = context.characters.length
    ? context.characters.map((character) => `- ${character.name} (${character.role}): ${character.memory}`).join("\n")
    : "- No characters defined yet.";
  const chapterDigest = context.chapters.length
    ? context.chapters
        .map((chapter, index) => `- Chapter ${index + 1}: ${chapter.title}${chapter.summary ? ` | ${chapter.summary}` : ""}`)
        .join("\n")
    : "- No chapters yet.";
  const languageInstruction = buildResponseLanguageInstruction({
    taskSignals: [],
    storySignals: [
      { label: "braindump", text: context.braindump },
      { label: "synopsis", text: context.synopsis },
      {
        label: "chapter titles and summaries",
        text: context.chapters.map((chapter) => `${chapter.title} ${chapter.summary}`.trim()).join("\n"),
      },
      { label: "project title", text: context.projectName },
      {
        label: "character memory",
        text: context.characters.map((character) => `${character.name} ${character.role} ${character.memory}`.trim()).join("\n"),
      },
    ],
  });

  return `
You are an expert story architect creating a structured novel outline.

${languageInstruction}

[PROJECT]
Title: ${context.projectName}
Genre: ${context.genre}
Tone: ${context.tone}
Audience: ${context.audience}

[BRAINDUMP]
${context.braindump || "No braindump yet."}

[SYNOPSIS]
${context.synopsis || "No synopsis yet."}

[CHARACTERS]
${characters}

[WORLD RULES]
${worldRules}

[REAL CHAPTERS]
${chapterDigest}

Return only valid JSON with this shape:
{
  "acts": [
    {
      "title": "Act title",
      "summary": "Short act summary",
      "chapters": [
        {
          "title": "Chapter title",
          "summary": "Short chapter summary"
        }
      ]
    }
  ]
}

Requirements:
- Create 3 to 5 acts when possible.
- Each act should contain 2 to 5 chapters.
- Keep the outline aligned with the supplied project details.
- Keep chapter summaries concise and actionable.
- Do not include any text outside the JSON.
`.trim();
}

function buildLongOutlinePrompt(
  context: StoryBibleGenerationContext,
  targetChapterCount: number,
  segmentStart: number,
  segmentEnd: number,
  previousArcDigest: string,
) {
  const worldRules = context.worldRules.length ? context.worldRules.map((rule) => `- ${rule}`).join("\n") : "- No world rules yet.";
  const characters = context.characters.length
    ? context.characters.map((character) => `- ${character.name} (${character.role}): ${character.memory}`).join("\n")
    : "- No characters defined yet.";
  const chapterDigest = context.chapters.length
    ? context.chapters
        .map((chapter, index) => `- Chapter ${index + 1}: ${chapter.title}${chapter.summary ? ` | ${chapter.summary}` : ""}`)
        .join("\n")
    : "- No chapters yet.";

  return `
You are an expert long-form story architect designing a scalable outline for a large serialized novel.

[PROJECT]
Title: ${context.projectName}
Genre: ${context.genre}
Tone: ${context.tone}
Audience: ${context.audience}
Target chapter count: ${targetChapterCount}
Segment to generate now: chapters ${segmentStart}-${segmentEnd}

[BRAINDUMP]
${context.braindump || "No braindump yet."}

[SYNOPSIS]
${context.synopsis || "No synopsis yet."}

[CHARACTERS]
${characters}

[WORLD RULES]
${worldRules}

[REAL CHAPTERS]
${chapterDigest}

[RECENT PRIOR OUTLINE CONTINUITY]
${previousArcDigest || "No prior generated segments yet."}

Return only valid JSON:
{
  "arcs": [
    {
      "title": "Arc title",
      "summary": "What changes across this arc",
      "startChapterIndex": 1,
      "endChapterIndex": 10,
      "beats": [
        {
          "chapterIndex": 1,
          "title": "Chapter title",
          "summary": "Specific planned beat for this chapter",
          "focusEntities": ["character or place names"]
        }
      ]
    }
  ]
}

Requirements:
- Generate only chapters ${segmentStart} through ${segmentEnd}; do not include chapters outside this segment.
- Cover chapters ${segmentStart} through ${segmentEnd} without gaps.
- Use arcs of roughly 8 to 15 chapters.
- Each chapter beat must have a concrete plot function, not a vague placeholder.
- Keep existing real chapters consistent with their current titles and summaries.
- Do not include any text outside the JSON.
`.trim();
}
