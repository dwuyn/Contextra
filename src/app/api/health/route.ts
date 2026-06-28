import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const STALE_CONTINUITY_JOB_MS = 15 * 60 * 1000;

export async function GET() {
  try {
    // 1. Check DB liveness
    await prisma.$queryRaw`SELECT 1`;

    // 2. Query continuity job counts
    const jobCounts = await prisma.continuityJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const jobs = {
      queued: 0,
      processing: 0,
      done: 0,
      failed: 0,
    };

    for (const group of jobCounts) {
      const status = group.status as keyof typeof jobs;
      if (status in jobs) {
        jobs[status] = group._count._all;
      }
    }

    // 3. Find any stale jobs (e.g. processing for more than 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - STALE_CONTINUITY_JOB_MS);
    const staleProcessingCount = await prisma.continuityJob.count({
      where: {
        status: "processing",
        lockedAt: { lt: fifteenMinutesAgo },
      },
    });

    const staleQueuedCount = await prisma.continuityJob.count({
      where: {
        status: "queued",
        updatedAt: { lt: fifteenMinutesAgo },
      },
    });

    const collabHealth = { status: "disabled" as const, lastError: null };
    const continuityStatus =
      jobs.failed > 0 || staleProcessingCount > 0 || staleQueuedCount > 0
        ? "degraded"
        : jobs.queued > 0 || jobs.processing > 0
          ? "syncing"
          : "healthy";

    return NextResponse.json({
      status:
        continuityStatus === "degraded"
          ? "degraded"
          : continuityStatus === "syncing"
            ? "syncing"
            : "ok",
      database: "healthy",
      collaborationPersistence: {
        status: collabHealth.status,
        lastError: collabHealth.lastError,
      },
      continuityJobs: {
        ...jobs,
        staleProcessing: staleProcessingCount,
        staleQueued: staleQueuedCount,
      },
    });
  } catch (error) {
    console.error("Health probe failed:", error);
    return NextResponse.json(
      {
        status: "degraded",
        database: "unhealthy",
        collaborationPersistence: {
          status: "disabled",
          lastError: null,
        },
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
