import { generateText } from "ai";
import { chatModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

function stripReasoning(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/u, "$1")
    .trim();
}

type ChapterSummaryInput = {
  chapterId: string;
  title: string;
  content: string;
};

async function summarizeChapterContent({ title, content }: Omit<ChapterSummaryInput, "chapterId">) {
  const prompt = `
You are an expert story editor. Your task is to summarize the provided chapter content.
Please identify:
1. The key events and plot progressions.
2. Any new facts learned about the world or characters.
3. The specific characters involved and any changes to their state or relationships.
4. The emotional tone of the chapter.

Chapter Title: ${title}
Content:
${content}

Return ONLY valid JSON in the following format:
{
  "summary": "A 2-3 sentence narrative summary of the chapter.",
  "keyEvents": ["event 1", "event 2"],
  "factsLearned": ["fact 1", "fact 2"],
  "characters": ["character 1", "character 2"],
  "emotional": "tense, hopeful, etc."
}
`.trim();

  const { text } = await generateText({
    model: chatModel(),
    prompt,
    temperature: 0.3,
  });

  const cleanText = stripReasoning(text);

  try {
    return JSON.parse(cleanText) as {
      summary?: string;
      keyEvents?: unknown;
      factsLearned?: unknown;
      characters?: unknown;
      emotional?: string;
    };
  } catch {
    console.error("Failed to parse compression JSON:", cleanText);
    throw new Error("AI returned invalid JSON during chapter compression.");
  }
}

export async function deleteChapterSummary(chapterId: string) {
  await prisma.chapterSummary.deleteMany({ where: { chapterId } });
}

export async function upsertChapterSummary(input: ChapterSummaryInput) {
  const json = await summarizeChapterContent({
    title: input.title,
    content: input.content,
  });

  await prisma.chapterSummary.upsert({
    where: { chapterId: input.chapterId },
    create: {
      chapterId: input.chapterId,
      summary: json.summary || "No summary provided.",
      keyEvents: json.keyEvents || [],
      factsLearned: json.factsLearned || [],
      characters: json.characters || [],
      emotional: json.emotional || "neutral",
    },
    update: {
      summary: json.summary || "No summary provided.",
      keyEvents: json.keyEvents || [],
      factsLearned: json.factsLearned || [],
      characters: json.characters || [],
      emotional: json.emotional || "neutral",
    },
  });
}

/**
 * Summarizes a chapter's events and characters and stores the compressed representation in the database.
 */
export async function compressChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
  });

  if (!chapter) throw new Error("Chapter not found");

  if (!chapter.content.trim()) {
    await deleteChapterSummary(chapterId);
    return;
  }

  await upsertChapterSummary({
    chapterId,
    title: chapter.title,
    content: chapter.content,
  });
}
