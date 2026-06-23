"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireHydratedProjectAccess } from "@/services/projectService";

function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let md = html;

  // Replace headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");

  // Replace bold/italic/underline
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, "_$1_");

  // Replace paragraph tags
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");

  // Replace lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<ul[^>]*>/gi, "\n");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>/gi, "\n");
  md = md.replace(/<\/ol>/gi, "\n");

  // Strip other tags
  md = md.replace(/<[^>]+>/g, "");

  // Normalize formatting
  md = md.split("\n").map((line) => line.trim()).join("\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

export async function exportProjectAction(projectId: string): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const [project, chapters, branches] = await Promise.all([
    requireHydratedProjectAccess(projectId, session.userId, "view"),
    prisma.chapter.findMany({
      where: { projectId },
      orderBy: { index: "asc" },
      select: { id: true, title: true, content: true, summary: true, index: true, branchId: true },
    }),
    prisma.branch.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const branchSections = branches
    .map((branch) => {
      const branchChapters = chapters.filter((c) => c.branchId === branch.id);
      const chapterBlock = branchChapters
        .map((c) => {
          const markdownContent = htmlToMarkdown(c.content);
          return `### Chapter ${c.index}: ${c.title}\n\n${markdownContent}`;
        })
        .join("\n\n---\n\n");

      return `## Branch: ${branch.name}\n${branch.description ? `*${branch.description}*\n\n` : ""}${chapterBlock || "_No chapters yet._"}`;
    })
    .join("\n\n========================================\n\n");

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
    `## Branches & Chapters`,
    ``,
    branchSections || "_No branches or chapters found._",
  ];

  return lines.join("\n");
}
