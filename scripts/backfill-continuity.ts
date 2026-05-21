import { prisma } from "../src/lib/prisma";
import { enqueueProjectContinuityJobs } from "../src/services/continuityJobService";

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      chapters: {
        select: { id: true, branchId: true },
        orderBy: [{ index: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  for (const project of projects) {
    await enqueueProjectContinuityJobs({
      projectId: project.id,
      chapters: project.chapters,
    });
    console.log(
      JSON.stringify({
        event: "continuity_backfill_enqueued",
        projectId: project.id,
        chapters: project.chapters.length,
      }),
    );
  }
}

main()
  .catch((error) => {
    console.error("Continuity backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
