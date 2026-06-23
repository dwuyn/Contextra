import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const staleProcessingCount = await prisma.continuityJob.count({
      where: {
        status: "processing",
        lockedAt: { lt: fifteenMinutesAgo },
      },
    });

    return NextResponse.json({
      status: "ok",
      database: "healthy",
      continuityJobs: {
        ...jobs,
        staleProcessing: staleProcessingCount,
      },
    });
  } catch (error) {
    console.error("Health probe failed:", error);
    return NextResponse.json(
      {
        status: "degraded",
        database: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
