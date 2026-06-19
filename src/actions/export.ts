"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireHydratedProjectAccess } from "@/services/projectService";

export async function exportProjectAction(projectId: string): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const [project, chapters] = await Promise.all([
    requireHydratedProjectAccess(projectId, session.userId, "view"),
    prisma.chapter.findMany({
      where: { projectId },
      orderBy: { index: "asc" },
      select: { id: true, title: true, content: true, summary: true, index: true },
    }),
  ]);

  const chapterBlock = chapters
    .map((c) => {
      const plainText = c.content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return `## Chapter ${c.index}: ${c.title}\n\n${plainText}`;
    })
    .join("\n\n---\n\n");

  const lines = [
    `# ${project.metadata.name}`,
    ``,
    `**Genre:** ${project.metadata.genre}`,
    `**Mode:** ${project.metadata.mode}`,
    ``,
    `## Summary`,
    ``,
    project.metadata.summary || "_No summary yet._",
    ``,
    `## Context`,
    ``,
    `- **Tone:** ${project.contextMemory.tone}`,
    `- **Audience:** ${project.contextMemory.audience}`,
    `- **Shared Notes:** ${project.contextMemory.sharedNotes || "None"}`,
    `- **World Rules:** ${(project.contextMemory.worldRules as string[]).join(", ") || "None"}`,
    ``,
    `## Characters`,
    ``,
    ...(project.characters.length > 0
      ? project.characters.map((c) => `- **${c.name}** (${c.role}): ${c.memory}`)
      : ["_No characters defined yet._"]),
    ``,
    `## Chapters`,
    ``,
    chapterBlock || "_No chapters yet._",
  ];

  return lines.join("\n");
}
