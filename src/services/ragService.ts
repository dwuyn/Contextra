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
function chunkText(text: string, maxWords: number = CHUNK_SIZE, overlapWords: number = OVERLAP): string[] {
  if (!text.trim()) return [];

  // Simple word-based chunker. For production, consider a token-based chunker or sentence boundary detection.
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + maxWords).join(" ");
    chunks.push(chunk);
    i += maxWords - overlapWords;
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
  const embeddedChunks: Array<{ chunkContent: string; vectorLiteral: string; index: number }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    const embedding = await generateEmbedding(chunkContent, "RETRIEVAL_DOCUMENT");
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected 768 dimensions, got ${embedding.length}`);
    }

    embeddedChunks.push({ chunkContent, vectorLiteral: toPgVectorLiteral(embedding), index: i });
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
  
  // Use raw SQL for nearest neighbor search using the <-> operator (cosine distance)
  // We join with Chapter to ensure we only retrieve chunks from the current project/branch context.
  const results = await prisma.$queryRaw<Array<{ content: string; chapterTitle: string; distance: number }>>`
    SELECT
      sc.content,
      c.title as "chapterTitle",
      sc.vector <-> ${queryVector}::vector as distance
    FROM "SceneChunk" sc
    JOIN "Chapter" c ON sc."chapterId" = c.id
    WHERE c."projectId" = ${projectId} AND ${chapterFilter}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results.map(r => `[From ${r.chapterTitle}]: ${r.content}`);
}
