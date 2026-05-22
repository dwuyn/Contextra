import { embed } from "ai";
import { embeddingModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { toPgVectorLiteral } from "@/services/ragService";

const CHUNK_SIZE = 500;
const OVERLAP = 50;

type Counts = {
  total: number;
  succeeded: number;
  failed: number;
};

type EmbeddedChunk = {
  content: string;
  index: number;
  vectorLiteral: string;
};

function createCounts(): Counts {
  return { total: 0, succeeded: 0, failed: 0 };
}

function stripHtmlToPlainText(content: string) {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, maxWords: number = CHUNK_SIZE, overlapWords: number = OVERLAP) {
  if (!text.trim()) return [];

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return [text];

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
    i += maxWords - overlapWords;
  }
  return chunks;
}

async function generateEmbedding(value: string) {
  const { embedding } = await embed({
    model: embeddingModel(),
    value,
  });
  return embedding;
}

async function reembedSceneChunks() {
  const counts = createCounts();
  console.log(`[reembed] Processing SceneChunks...`);

  const chapters = await prisma.chapter.findMany({
    select: { id: true, content: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const chapter of chapters) {
    const chunks = chunkText(stripHtmlToPlainText(chapter.content));
    counts.total += chunks.length;

    try {
      const embeddedChunks: EmbeddedChunk[] = [];
      for (let index = 0; index < chunks.length; index++) {
        const content = chunks[index];
        const vectorLiteral = toPgVectorLiteral(await generateEmbedding(content));
        embeddedChunks.push({ content, index, vectorLiteral });
      }

      await prisma.$transaction(async (tx) => {
        await tx.sceneChunk.deleteMany({ where: { chapterId: chapter.id } });

        for (const chunk of embeddedChunks) {
          await tx.$executeRaw`
            INSERT INTO "SceneChunk" ("id", "chapterId", "content", "vector", "index", "createdAt")
            VALUES (gen_random_uuid(), ${chapter.id}, ${chunk.content}, ${chunk.vectorLiteral}::vector, ${chunk.index}, NOW())
          `;
        }
      });

      counts.succeeded += chunks.length;
    } catch (error) {
      counts.failed += chunks.length;
      console.error(`[reembed] SceneChunk failed for chapter ${chapter.id}:`, error);
    }
  }

  return counts;
}

async function reembedCanonEntities() {
  const counts = createCounts();
  console.log(`[reembed] Processing CanonEntities...`);

  const entities = await prisma.canonEntity.findMany({
    where: { status: "active" },
    select: { id: true, name: true, summary: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  counts.total = entities.length;

  for (const entity of entities) {
    try {
      const vectorLiteral = toPgVectorLiteral(await generateEmbedding(`${entity.name}. ${entity.summary}`));
      await prisma.$executeRaw`
        UPDATE "CanonEntity" SET "vector" = ${vectorLiteral}::vector WHERE "id" = ${entity.id}
      `;
      counts.succeeded++;
    } catch (error) {
      counts.failed++;
      console.error(`[reembed] CanonEntity failed for ${entity.id}:`, error);
    }
  }

  return counts;
}

async function reembedCanonFacts() {
  const counts = createCounts();
  console.log(`[reembed] Processing CanonFacts...`);

  const facts = await prisma.canonFact.findMany({
    where: { status: "approved" },
    select: { id: true, content: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  counts.total = facts.length;

  for (const fact of facts) {
    try {
      const vectorLiteral = toPgVectorLiteral(await generateEmbedding(fact.content));
      await prisma.$executeRaw`
        UPDATE "CanonFact" SET "vector" = ${vectorLiteral}::vector WHERE "id" = ${fact.id}
      `;
      counts.succeeded++;
    } catch (error) {
      counts.failed++;
      console.error(`[reembed] CanonFact failed for ${fact.id}:`, error);
    }
  }

  return counts;
}

async function reembedCanonRelations() {
  const counts = createCounts();
  console.log(`[reembed] Processing CanonRelations...`);

  const relations = await prisma.canonRelation.findMany({
    where: { status: "approved" },
    select: { id: true, summary: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  counts.total = relations.length;

  for (const relation of relations) {
    try {
      const vectorLiteral = toPgVectorLiteral(await generateEmbedding(relation.summary));
      await prisma.$executeRaw`
        UPDATE "CanonRelation" SET "vector" = ${vectorLiteral}::vector WHERE "id" = ${relation.id}
      `;
      counts.succeeded++;
    } catch (error) {
      counts.failed++;
      console.error(`[reembed] CanonRelation failed for ${relation.id}:`, error);
    }
  }

  return counts;
}

function formatCounts(counts: Counts) {
  return `${counts.succeeded}/${counts.total}`;
}

async function main() {
  const sceneChunks = await reembedSceneChunks();
  const canonEntities = await reembedCanonEntities();
  const canonFacts = await reembedCanonFacts();
  const canonRelations = await reembedCanonRelations();

  console.log(
    `[reembed] Done. SceneChunks: ${formatCounts(sceneChunks)}, CanonEntities: ${formatCounts(canonEntities)}, CanonFacts: ${formatCounts(canonFacts)}, CanonRelations: ${formatCounts(canonRelations)}`,
  );

  const failed = sceneChunks.failed + canonEntities.failed + canonFacts.failed + canonRelations.failed;
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`[reembed] Unrecoverable error:`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
