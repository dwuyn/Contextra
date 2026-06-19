import { generateImage, generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { chatModel, imageModel } from "@/lib/ai";
import { normalizeStringList, stripHtml, stripReasoning } from "@/lib/utils";

const AI_CHAT_MODEL = process.env.AI_CHAT_MODEL || "gemini-2.5-flash";
const AI_IMAGE_MODEL = process.env.AI_IMAGE_MODEL || "imagen-4.0-generate-001";
const MAX_WORLD_RULES = 8;
const MAX_CHARACTERS = 8;
const MAX_SUMMARY_LENGTH = 800;
const MAX_CHAPTER_CONTEXT_LENGTH = 8_000;
const MAX_CHARACTER_MEMORY_LENGTH = 280;
const MAX_PROMPT_LENGTH = 1_200;

type IllustrationProjectContext = {
  projectName: string;
  genre: string;
  summary: string;
  tone: string;
  audience: string;
  worldRules: string[];
  characters: Array<{ name: string; role: string; memory: string }>;
};

export type GenerateChapterIllustrationInput = {
  projectId: string;
  chapterTitle: string;
  chapterContent: string;
  customInstruction?: string;
};

export type GeneratedChapterIllustrationAsset = {
  prompt: string;
  model: string;
  contentType: string;
  bytes: Uint8Array;
  tokens: number;
};

function clipText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function hasMeaningfulIllustrationSource(chapterContent: string) {
  return stripHtml(chapterContent).length > 0;
}

async function loadIllustrationProjectContext(projectId: string): Promise<IllustrationProjectContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      genre: true,
      summary: true,
      tone: true,
      audience: true,
      worldRules: true,
      characters: {
        orderBy: { updatedAt: "desc" },
        take: MAX_CHARACTERS,
        select: {
          name: true,
          role: true,
          memory: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  return {
    projectName: project.name,
    genre: project.genre,
    summary: clipText(project.summary, MAX_SUMMARY_LENGTH),
    tone: project.tone,
    audience: project.audience,
    worldRules: normalizeStringList(project.worldRules)
      .map((rule) => clipText(rule, 180))
      .filter(Boolean)
      .slice(0, MAX_WORLD_RULES),
    characters: project.characters.map((character) => ({
      ...character,
      memory: clipText(character.memory, MAX_CHARACTER_MEMORY_LENGTH),
    })),
  };
}

export function buildChapterIllustrationPromptWriterInput(
  context: IllustrationProjectContext,
  input: Omit<GenerateChapterIllustrationInput, "projectId">,
) {
  const worldRules = context.worldRules.length
    ? context.worldRules.map((rule) => `- ${rule}`).join("\n")
    : "- None provided.";
  const characters = context.characters.length
    ? context.characters
        .map((character) => `- ${character.name} (${character.role}): ${character.memory || "No notes."}`)
        .join("\n")
    : "- No character notes provided.";
  const chapterText = clipText(stripHtml(input.chapterContent), MAX_CHAPTER_CONTEXT_LENGTH);

  return `
You are a senior art director writing final English prompts for Google Imagen book-cover illustrations.

Return strict JSON only in this shape:
{"prompt":"..."}

Rules for the prompt:
- English only.
- Under 150 words.
- Describe a single vertical 3:4 chapter-cover illustration.
- No text, no lettering, no typography, no logos, no watermarks, no signatures, no frames.
- Use vivid visual nouns, composition, lighting, palette, mood, and medium.
- Make the image feel like premium editorial fiction cover art, not a movie poster.
- The chapter title and book title must not appear inside the image.
- If the source chapter is ambiguous, choose the strongest visual moment that preserves story tone.

[PROJECT]
Name: ${context.projectName}
Genre: ${context.genre || "Not specified"}
Tone: ${context.tone || "Not specified"}
Audience: ${context.audience || "Not specified"}
Summary: ${context.summary || "Not specified"}

[WORLD RULES]
${worldRules}

[CHARACTERS]
${characters}

[CURRENT CHAPTER TITLE]
${input.chapterTitle}

[CURRENT CHAPTER TEXT]
${chapterText || "No chapter text provided."}

[OPTIONAL USER ART DIRECTION]
${input.customInstruction?.trim() || "No extra art direction provided."}

Write one polished prompt that follows the story context and optional art direction.
`.trim();
}

function normalizeIllustrationPrompt(rawPrompt: string) {
  const normalized = rawPrompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error("Image prompt generation returned empty output.");
  }

  return normalized.length > MAX_PROMPT_LENGTH
    ? `${normalized.slice(0, Math.max(0, MAX_PROMPT_LENGTH - 3))}...`
    : normalized;
}

async function createChapterIllustrationPrompt(
  context: IllustrationProjectContext,
  input: Omit<GenerateChapterIllustrationInput, "projectId">,
) {
  const { text, usage } = await generateText({
    model: chatModel(),
    prompt: buildChapterIllustrationPromptWriterInput(context, input),
    temperature: 0.6,
  });

  const cleanText = stripReasoning(text);

  try {
    const parsed = JSON.parse(cleanText) as { prompt?: string };
    return {
      prompt: normalizeIllustrationPrompt(parsed.prompt ?? ""),
      tokens: usage.totalTokens ?? 0,
    };
  } catch (error) {
    console.error("Failed to parse illustration prompt JSON:", cleanText, error);
    throw new Error("AI returned an invalid image prompt. Please try again.");
  }
}

export async function generateChapterIllustrationAsset(
  input: GenerateChapterIllustrationInput,
): Promise<GeneratedChapterIllustrationAsset> {
  const context = await loadIllustrationProjectContext(input.projectId);
  const promptResult = await createChapterIllustrationPrompt(context, input);
  const imageResult = await generateImage({
    model: imageModel(),
    prompt: promptResult.prompt,
    n: 1,
    aspectRatio: "3:4",
    providerOptions: {
      vertex: {
        addWatermark: true,
        sampleImageSize: "1K",
      },
    },
  });

  const asset = imageResult.image;

  return {
    prompt: promptResult.prompt,
    model: imageResult.responses.at(-1)?.modelId ?? AI_IMAGE_MODEL,
    contentType: asset.mediaType,
    bytes: asset.uint8Array,
    tokens: promptResult.tokens + (imageResult.usage.totalTokens ?? 0),
  };
}

export function getChapterIllustrationUsageModelLabel(model: string) {
  return `${AI_CHAT_MODEL} -> ${model}`;
}
