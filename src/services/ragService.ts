import { embed } from "ai";
import { Prisma } from "@prisma/client";
import { embeddingModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

const CHUNK_SIZE = 500;
const OVERLAP = 50;
const EMBEDDING_DIMENSIONS = 768;

function stripHtmlToPlainText(content: string) {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function toPgVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

/**
 * Splits text into chunks by sentences/paragraphs, roughly matching the target token/word size.
 */
function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
  const sentences: string[] = [...matches];
  const remaining = cleaned.replace(/[^.!?]+[.!?]+(\s|$)/g, "").trim();
  if (remaining) sentences.push(remaining);
  return sentences.map((s) => s.trim()).filter(Boolean);
}

function fallbackWordChunks(words: string[], maxWords: number, overlapWords: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
    i += maxWords - overlapWords;
  }
  return chunks;
}

function chunkText(text: string, maxWords: number = CHUNK_SIZE, overlapWords: number = OVERLAP): string[] {
  if (!text.trim()) return [];

  const sentences = splitSentences(text);
  if (sentences.length <= 1) {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return [text];
    return fallbackWordChunks(words, maxWords, overlapWords);
  }

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.split(/\s+/).filter(Boolean).length;

    if (currentWordCount + sentenceWordCount <= maxWords) {
      currentChunk.push(sentence);
      currentWordCount += sentenceWordCount;
    } else if (sentenceWordCount > maxWords) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentWordCount = 0;
      }
      chunks.push(...fallbackWordChunks(sentence.split(/\s+/), maxWords, overlapWords));
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
      }
      currentChunk = [sentence];
      currentWordCount = sentenceWordCount;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

/**
 * Generates an embedding for a piece of text using Google Cloud Vertex AI Gemini embeddings.
 */
export async function generateEmbedding(
  text: string,
  taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(),
    value: text,
    ...(taskType
      ? {
          providerOptions: {
            vertex: {
              taskType: taskType === "RETRIEVAL_DOCUMENT" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
            },
          },
        }
      : {}),
  });
  return embedding;
}

/**
 * Chunks a chapter's content, generates embeddings for each chunk, and saves them to the database.
 */
export async function processAndSaveChapterChunks(chapterId: string, content: string) {
  const cleanContent = stripHtmlToPlainText(content);
  if (!cleanContent) {
    await prisma.$transaction(async tx => {
      await tx.sceneChunk.deleteMany({ where: { chapterId } });
    });
    return;
  }

  const chunks = chunkText(cleanContent);
  const embeddings = await Promise.all(
    chunks.map((chunkContent) => generateEmbedding(chunkContent, "RETRIEVAL_DOCUMENT")),
  );

  const embeddedChunks: Array<{ chunkContent: string; vectorLiteral: string; index: number }> = [];
  for (let i = 0; i < embeddings.length; i++) {
    if (embeddings[i].length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected 768 dimensions, got ${embeddings[i].length}`);
    }
    embeddedChunks.push({ chunkContent: chunks[i], vectorLiteral: toPgVectorLiteral(embeddings[i]), index: i });
  }

  await prisma.$transaction(async tx => {
    await tx.sceneChunk.deleteMany({ where: { chapterId } });

    for (const { chunkContent, vectorLiteral, index } of embeddedChunks) {
      // Store in Prisma using raw SQL because Prisma doesn't natively support creating vectors with the ORM client methods yet,
      // though the Unsupported("vector") type is there, inserting usually requires string casting.
      await tx.$executeRaw`
      INSERT INTO "SceneChunk" ("id", "chapterId", "content", "vector", "index", "createdAt")
      VALUES (gen_random_uuid(), ${chapterId}, ${chunkContent}, ${vectorLiteral}::vector, ${index}, NOW())
    `;
    }
  });
}

/**
 * Searches the vector database for chunks semantically similar to the query.
 */
export async function semanticSearch(
  query: string,
  projectId: string,
  branchId: string,
  limit: number = 3,
  chapterIds?: string[],
) {
  const queryEmbedding = await generateEmbedding(query, "RETRIEVAL_QUERY");
  const queryVector = toPgVectorLiteral(queryEmbedding);
  const chapterFilter = chapterIds?.length
    ? Prisma.sql`c."id" IN (${Prisma.join(chapterIds)})`
    : Prisma.sql`c."branchId" = ${branchId}`;
  
  // Use raw SQL for nearest neighbor search using cosine distance (<=>)
  // We join with Chapter to ensure we only retrieve chunks from the current project/branch context.
  const results = await prisma.$queryRaw<Array<{ content: string; chapterTitle: string; distance: number }>>`
    SELECT
      sc.content,
      c.title as "chapterTitle",
      sc.vector <=> ${queryVector}::vector as distance
    FROM "SceneChunk" sc
    JOIN "Chapter" c ON sc."chapterId" = c.id
    WHERE c."projectId" = ${projectId} AND ${chapterFilter} AND (sc.vector <=> ${queryVector}::vector) < 0.35
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results.map(r => `[From ${r.chapterTitle}]: ${r.content}`);
}
