import { prisma } from "@/lib/prisma";

export interface PromptContext {
  projectName: string;
  projectSummary: string;
  branchName: string;
  branchDescription: string;
  branchHighlights: string[];
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: string[];
  characterDigest: string;
  slidingWindowText: string;
  ragContext: string[];
}

export async function composeContext(
  projectId: string, 
  branchId: string, 
  userInstructions: string,
  fromRagService: (q: string, pId: string, bId: string, l: number) => Promise<string[]> = async () => []
): Promise<PromptContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      chapters: {
        orderBy: [{ index: "asc" }, { createdAt: "asc" }],
        include: { summaryObj: true },
      },
      branches: true,
      characters: true,
    },
  });

  if (!project) throw new Error("Project not found");

  const branch = project.branches.find((b) => b.id === branchId) || project.branches[0];
  const lineage = await buildContinuity(project, branch.id);
  
  // Sliding Window: Grab the exact content of the most recent chapter
  const mostRecentChapter = lineage[lineage.length - 1];
  const slidingWindowText = mostRecentChapter ? mostRecentChapter.content.replace(/<[^>]+>/g, " ").trim().slice(-4000) : "No immediate previous text.";

  // RAG: Query for similar scenes using user instructions if provided
  const ragContext = userInstructions ? await fromRagService(userInstructions, projectId, branch.id, 4) : [];

  const characterDigest = project.characters.length
    ? project.characters
        .map((c) => `${c.name} (${c.role}) | Memory: ${c.memory}`)
        .join("\n")
    : "No characters defined yet.";

  return {
    projectName: project.name,
    projectSummary: project.summary,
    branchName: branch.name,
    branchDescription: branch.description,
    branchHighlights: (branch.highlights as string[]) || [],
    tone: project.tone,
    audience: project.audience,
    sharedNotes: project.sharedNotes,
    worldRules: (project.worldRules as string[]) || [],
    characterDigest,
    slidingWindowText,
    ragContext,
  };
}

async function buildContinuity(project: any, branchId: string, stopAtChapterId?: string, seenBranchIds = new Set<string>()): Promise<any[]> {
  if (seenBranchIds.has(branchId)) return [];
  seenBranchIds.add(branchId);

  const orderedBranchChapters = project.chapters.filter((c: any) => c.branchId === branchId);
  const branch = project.branches.find((b: any) => b.id === branchId);
  
  let lineage: any[] = [];
  if (branch && branch.basedOnChapterId !== "root") {
    const anchorChapter = project.chapters.find((c: any) => c.id === branch.basedOnChapterId);
    if (anchorChapter) {
      lineage = await buildContinuity(project, anchorChapter.branchId, anchorChapter.id, seenBranchIds);
    }
  }

  const currentBranch = stopAtChapterId
    ? orderedBranchChapters.slice(0, Math.max(orderedBranchChapters.findIndex((c: any) => c.id === stopAtChapterId) + 1, 0))
    : orderedBranchChapters;

  return [...lineage, ...currentBranch];
}

function getChapterMemory(chapter: any) {
  if (chapter.summaryObj) return chapter.summaryObj.summary;
  const summary = chapter.summary?.trim();
  if (summary) return summary;

  const excerpt = chapter.content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  return excerpt || "No summary yet.";
}

export function exportProject(project: any) {
  const chapterBlock = project.chapters
    .map((c: any) => `${c.title}\n\n${c.content}`)
    .join("\n\n---\n\n");

  return [
    project.name,
    `Genre: ${project.genre}`,
    `Mode: ${project.mode}`,
    `Summary: ${project.summary}`,
    "",
    "Context Memory",
    `Tone: ${project.tone}`,
    `Audience: ${project.audience}`,
    `Shared notes: ${project.sharedNotes}`,
    `World rules: ${(project.worldRules as string[]).join(" | ")}`,
    "",
    "Characters",
    ...project.characters.map((c: any) => `- ${c.name}: ${c.role}. Memory: ${c.memory}`),
    "",
    "Chapters",
    chapterBlock || "No chapters yet.",
  ].join("\n");
}
