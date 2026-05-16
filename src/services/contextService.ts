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
  recentChapterSummaries: Array<{
    chapterTitle: string;
    summary: string;
  }>;
  slidingWindowText: string;
  ragContext: string[];
}

type ContextChapter = {
  id: string;
  branchId: string;
  title: string;
  summary: string;
  content: string;
  summaryObj: { summary: string } | null;
};

type ContextBranch = {
  id: string;
  name: string;
  description: string;
  basedOnChapterId: string;
  highlights: unknown;
};

type ContextProject = {
  name: string;
  summary: string;
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: unknown;
  chapters: ContextChapter[];
  branches: ContextBranch[];
  characters: Array<{ name: string; role: string; memory: string }>;
};

type ExportableProject = {
  name: string;
  genre: string;
  mode: string;
  summary: string;
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: unknown;
  characters: Array<{ name: string; role: string; memory: string }>;
  chapters: Array<{ title: string; content: string }>;
};

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stripHtml(content: string) {
  return content.replace(/<[^>]+>/g, " ").trim();
}

function getRecentChapterSummaries(lineage: ContextChapter[]) {
  return lineage
    .map((chapter) => ({
      chapterTitle: chapter.title,
      summary: chapter.summaryObj?.summary?.trim() || chapter.summary.trim(),
    }))
    .filter((chapter) => chapter.summary.length > 0)
    .slice(-6);
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
  if (!branch) throw new Error("Branch not found");

  const lineage = await buildContinuity(project, branch.id);
  const recentChapterSummaries = getRecentChapterSummaries(lineage);
  
  // Sliding Window: Grab the exact content of the most recent chapter
  const mostRecentChapter = lineage[lineage.length - 1];
  const slidingWindowText = mostRecentChapter ? stripHtml(mostRecentChapter.content).slice(-4000) : "No immediate previous text.";

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
    branchHighlights: normalizeStringList(branch.highlights),
    tone: project.tone,
    audience: project.audience,
    sharedNotes: project.sharedNotes,
    worldRules: normalizeStringList(project.worldRules),
    characterDigest,
    recentChapterSummaries,
    slidingWindowText,
    ragContext,
  };
}

async function buildContinuity(
  project: ContextProject,
  branchId: string,
  stopAtChapterId?: string,
  seenBranchIds = new Set<string>(),
): Promise<ContextChapter[]> {
  if (seenBranchIds.has(branchId)) return [];
  seenBranchIds.add(branchId);

  const orderedBranchChapters = project.chapters.filter((c) => c.branchId === branchId);
  const branch = project.branches.find((b) => b.id === branchId);
  
  let lineage: ContextChapter[] = [];
  if (branch && branch.basedOnChapterId !== "root") {
    const anchorChapter = project.chapters.find((c) => c.id === branch.basedOnChapterId);
    if (anchorChapter) {
      lineage = await buildContinuity(project, anchorChapter.branchId, anchorChapter.id, seenBranchIds);
    }
  }

  const currentBranch = stopAtChapterId
    ? orderedBranchChapters.slice(0, Math.max(orderedBranchChapters.findIndex((c) => c.id === stopAtChapterId) + 1, 0))
    : orderedBranchChapters;

  return [...lineage, ...currentBranch];
}

export function exportProject(project: ExportableProject) {
  const chapterBlock = project.chapters
    .map((c) => `${c.title}\n\n${c.content}`)
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
    ...project.characters.map((c) => `- ${c.name}: ${c.role}. Memory: ${c.memory}`),
    "",
    "Chapters",
    chapterBlock || "No chapters yet.",
  ].join("\n");
}
