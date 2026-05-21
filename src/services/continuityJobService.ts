import { createHash } from "node:crypto";
import { deleteChapterSummary, upsertChapterSummary } from "@/services/memoryService";
import { processAndSaveChapterChunks } from "@/services/ragService";
import { createCanonProposalsForChapter } from "@/services/canonService";
import { prisma } from "@/lib/prisma";

export type ChapterContinuityInput = {
  chapterId: string;
  projectId: string;
  branchId: string;
  title: string;
  content: string;
};

type EnqueueContinuityInput = {
  chapterId: string;
  projectId: string;
  branchId: string;
  content?: string;
};

type EnqueueProjectContinuityInput = {
  projectId: string;
  chapters: Array<{
    id: string;
    branchId: string;
  }>;
};

const CHAPTER_CONTINUITY_JOB = "chapter_continuity";
const MAX_JOB_ATTEMPTS = 3;

function isBlankContent(content: string) {
  return !content.replace(/<[^>]+>/g, " ").trim();
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function retryDelayMs(attempts: number) {
  return Math.min(attempts * 60_000, 15 * 60_000);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function refreshChapterContinuityNow({
  chapterId,
  projectId,
  branchId,
  title,
  content,
}: ChapterContinuityInput) {
  if (isBlankContent(content)) {
    await Promise.all([
      processAndSaveChapterChunks(chapterId, ""),
      deleteChapterSummary(chapterId),
      createCanonProposalsForChapter({ chapterId, projectId, branchId, title, content: "" }),
    ]);
    return;
  }

  await Promise.all([
    processAndSaveChapterChunks(chapterId, content),
    upsertChapterSummary({ chapterId, title, content }),
    createCanonProposalsForChapter({ chapterId, projectId, branchId, title, content }),
  ]);
}

export async function enqueueChapterContinuityJob({
  chapterId,
  projectId,
  branchId,
  content,
}: EnqueueContinuityInput) {
  const contentHash = content === undefined ? undefined : hashContent(content);

  await prisma.$transaction([
    prisma.continuityJob.deleteMany({
      where: {
        chapterId,
        type: CHAPTER_CONTINUITY_JOB,
        status: "queued",
      },
    }),
    prisma.continuityJob.create({
      data: {
        projectId,
        chapterId,
        branchId,
        type: CHAPTER_CONTINUITY_JOB,
        status: "queued",
        contentHash,
      },
    }),
  ]);
}

export async function enqueueProjectContinuityJobs({ projectId, chapters }: EnqueueProjectContinuityInput) {
  if (chapters.length === 0) return;

  await prisma.$transaction([
    prisma.continuityJob.deleteMany({
      where: {
        projectId,
        type: CHAPTER_CONTINUITY_JOB,
        status: "queued",
      },
    }),
    prisma.continuityJob.createMany({
      data: chapters.map((chapter) => ({
        projectId,
        chapterId: chapter.id,
        branchId: chapter.branchId,
        type: CHAPTER_CONTINUITY_JOB,
        status: "queued",
      })),
    }),
  ]);
}

async function claimContinuityJob() {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "ContinuityJob"
      SET "status" = 'queued', "lockedAt" = NULL
      WHERE "status" = 'processing'
        AND "lockedAt" < NOW() - INTERVAL '15 minutes'
    `;

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ContinuityJob"
      WHERE "status" = 'queued'
        AND "type" = ${CHAPTER_CONTINUITY_JOB}
        AND "runAfter" <= NOW()
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const row = rows[0];
    if (!row) return null;

    return tx.continuityJob.update({
      where: { id: row.id },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        lockedAt: new Date(),
        error: null,
      },
      include: {
        chapter: {
          select: {
            id: true,
            projectId: true,
            branchId: true,
            title: true,
            content: true,
          },
        },
      },
    });
  });
}

export async function processNextContinuityJob() {
  const job = await claimContinuityJob();
  if (!job) return false;

  try {
    await refreshChapterContinuityNow({
      chapterId: job.chapter.id,
      projectId: job.chapter.projectId,
      branchId: job.chapter.branchId,
      title: job.chapter.title,
      content: job.chapter.content,
    });

    await prisma.continuityJob.update({
      where: { id: job.id },
      data: {
        status: "done",
        lockedAt: null,
        error: null,
      },
    });
  } catch (error) {
    const shouldRetry = job.attempts < MAX_JOB_ATTEMPTS;
    await prisma.continuityJob.update({
      where: { id: job.id },
      data: {
        status: shouldRetry ? "queued" : "failed",
        lockedAt: null,
        runAfter: shouldRetry ? new Date(Date.now() + retryDelayMs(job.attempts)) : new Date(),
        error: getErrorMessage(error),
      },
    });
    throw error;
  }

  return true;
}

export async function processContinuityJobs({ limit = 10 } = {}) {
  let processed = 0;
  let failures = 0;

  for (let index = 0; index < limit; index += 1) {
    try {
      const didProcess = await processNextContinuityJob();
      if (!didProcess) break;
      processed += 1;
    } catch (error) {
      failures += 1;
      console.error("Continuity job failed:", error);
    }
  }

  return { processed, failures };
}
