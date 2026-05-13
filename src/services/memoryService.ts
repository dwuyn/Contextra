import { generateText } from "ai";
import { customAi } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

function stripReasoning(text: string) {
  return text.replace(/<think>[\\s\\S]*?<\\/think>/g, "").trim();
}

/**
 * Summarizes a chapter's events and characters and stores the compressed representation in the database.
 */
export async function compressChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
  });

  if (!chapter) throw new Error("Chapter not found");

  const prompt = \`
You are an expert story editor. Your task is to summarize the provided chapter content.
Please identify:
1. The key events and plot progressions.
2. Any new facts learned about the world or characters.
3. The specific characters involved and any changes to their state or relationships.
4. The emotional tone of the chapter.

Chapter Title: \${chapter.title}
Content:
\${chapter.content}

Return ONLY valid JSON in the following format:
{
  "summary": "A 2-3 sentence narrative summary of the chapter.",
  "keyEvents": ["event 1", "event 2"],
  "factsLearned": ["fact 1", "fact 2"],
  "characters": ["character 1", "character 2"],
  "emotional": "tense, hopeful, etc."
}
\`.trim();

  const { text } = await generateText({
    model: customAi.chat("gemma4:31b-cloud"),
    prompt,
    temperature: 0.3,
  });

  const cleanText = stripReasoning(text);

  let json;
  try {
    json = JSON.parse(cleanText);
  } catch (err) {
    console.error("Failed to parse compression JSON:", cleanText);
    throw new Error("AI returned invalid JSON during chapter compression.");
  }

  // Save the summary
  await prisma.chapterSummary.upsert({
    where: { chapterId },
    create: {
      chapterId,
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
