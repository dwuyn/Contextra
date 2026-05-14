import { embed } from "ai";
import { customAi } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

const CHUNK_SIZE = 500;
const OVERLAP = 50;

/**
 * Splits text into chunks by sentences/paragraphs, roughly matching the target token/word size.
 */
function chunkText(text: string, maxWords: number = CHUNK_SIZE, overlapWords: number = OVERLAP): string[] {
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
 * Generates an embedding for a piece of text using the local Ollama instance via Vercel AI SDK.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: customAi.embedding("nomic-embed-text"),
    value: text,
  });
  return embedding;
}

/**
 * Chunks a chapter's content, generates embeddings for each chunk, and saves them to the database.
 */
export async function processAndSaveChapterChunks(chapterId: string, content: string) {
  // Clear existing chunks for this chapter
  await prisma.sceneChunk.deleteMany({ where: { chapterId } });

  // Clean HTML if necessary (simple strip for embeddings)
  const cleanContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const chunks = chunkText(cleanContent);

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    const embedding = await generateEmbedding(chunkContent);
    
    // Store in Prisma using raw SQL because Prisma doesn't natively support creating vectors with the ORM client methods yet,
    // though the Unsupported("vector") type is there, inserting usually requires string casting.
    await prisma.$executeRaw`
      INSERT INTO "SceneChunk" ("id", "chapterId", "content", "vector", "index", "createdAt")
      VALUES (gen_random_uuid(), ${chapterId}, ${chunkContent}, ${embedding}::vector, ${i}, NOW())
    `;
  }
}

/**
 * Searches the vector database for chunks semantically similar to the query.
 */
export async function semanticSearch(query: string, projectId: string, branchId: string, limit: number = 3) {
  const queryEmbedding = await generateEmbedding(query);
  
  // Use raw SQL for nearest neighbor search using the <-> operator (cosine distance)
  // We join with Chapter to ensure we only retrieve chunks from the current project/branch context.
  const results = await prisma.$queryRaw<Array<{ content: string; chapterTitle: string; distance: number }>>`
    SELECT
      sc.content,
      c.title as "chapterTitle",
      sc.vector <-> ${queryEmbedding}::vector as distance
    FROM "SceneChunk" sc
    JOIN "Chapter" c ON sc."chapterId" = c.id
    WHERE c."projectId" = ${projectId} AND c."branchId" = ${branchId}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results.map(r => `[From ${r.chapterTitle}]: ${r.content}`);
}
