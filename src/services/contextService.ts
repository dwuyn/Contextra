import { prisma } from "@/lib/prisma";
import { loadCanonPromptContext } from "@/services/canonService";

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
  outlineContext: string;
  canonContext: {
    currentArc: string;
    currentBeat: string;
    entities: string[];
    facts: string[];
    relations: string[];
  };
}

type ContextChapter = {
  id: string;
  branchId: string;
  title: string;
  summary: string;
  index: number;
  createdAt: Date;
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
  id: string;
  name: string;
  summary: string;
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: unknown;
  outline: unknown;
  branches: ContextBranch[];
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

const CONTEXT_BUDGETS = {
  characterDigest: 5_000,
  ragContext: 6_000,
  recentSummaries: 3_000,
  slidingWindow: 6_000,
  worldRules: 4_000,
};

function takeByCharBudget<T>(items: T[], render: (item: T) => string, budget: number) {
  const selected: string[] = [];
  let used = 0;

  for (const item of items) {
    const rendered = render(item).trim();
    if (!rendered) continue;

    const remaining = budget - used;
    if (remaining <= 0) break;

    const clipped = rendered.length > remaining ? `${rendered.slice(0, Math.max(0, remaining - 3))}...` : rendered;
    selected.push(clipped);
    used += clipped.length + 1;
  }

  return selected;
}

function extractSearchTerms(input: string) {
  const stopWords = new Set([
    "about",
    "after",
    "before",
    "chapter",
    "continue",
    "scene",
    "story",
    "the",
    "their",
    "them",
    "this",
    "with",
    "write",
  ]);

  return Array.from(new Set(input.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []))
    .filter((term) => !stopWords.has(term))
    .slice(0, 12);
}

function getRecentChapterSummaries(lineage: ContextChapter[]) {
  const summaries = lineage
    .map((chapter) => ({
      chapterTitle: chapter.title,
      summary: chapter.summaryObj?.summary?.trim() || chapter.summary.trim(),
    }))
    .filter((chapter) => chapter.summary.length > 0);
  const selected: Array<{ chapterTitle: string; summary: string }> = [];
  let used = 0;

  for (const chapter of [...summaries].reverse()) {
    const rendered = `${chapter.chapterTitle}: ${chapter.summary}`;
    const remaining = CONTEXT_BUDGETS.recentSummaries - used;
    if (remaining <= 0) break;

    const summary =
      rendered.length > remaining
        ? chapter.summary.slice(0, Math.max(0, remaining - chapter.chapterTitle.length - 6))
        : chapter.summary;
    selected.push({ ...chapter, summary });
    used += chapter.chapterTitle.length + summary.length + 3;
  }

  return selected.reverse();
}

function buildLegacyOutlineContext(outline: unknown, chapterIndex: number) {
  if (!outline || typeof outline !== "object") return "No legacy outline.";
  const acts = "acts" in outline && Array.isArray(outline.acts) ? outline.acts : [];
  let currentIndex = 0;

  for (const act of acts) {
    if (!act || typeof act !== "object") continue;
    const chapters = "chapters" in act && Array.isArray(act.chapters) ? act.chapters : [];
    for (const chapter of chapters) {
      currentIndex += 1;
      if (currentIndex !== chapterIndex || !chapter || typeof chapter !== "object") continue;
      const actTitle = "title" in act && typeof act.title === "string" ? act.title : "Untitled act";
      const chapterTitle = "title" in chapter && typeof chapter.title === "string" ? chapter.title : "Untitled chapter";
      const chapterSummary = "summary" in chapter && typeof chapter.summary === "string" ? chapter.summary : "";
      return `Legacy outline target: ${actTitle} / Chapter ${chapterIndex}: ${chapterTitle}. ${chapterSummary}`;
    }
  }

  return "No legacy outline beat for this chapter index.";
}

async function loadRagContext(
  projectId: string,
  branchId: string,
  userInstructions: string,
  fromRagService: (q: string, pId: string, bId: string, l: number, chapterIds?: string[]) => Promise<string[]>,
  chapterIds: string[],
) {
  if (!userInstructions) return [];

  try {
    const hits = await fromRagService(userInstructions, projectId, branchId, 12, chapterIds);
    return takeByCharBudget(hits, (hit) => hit, CONTEXT_BUDGETS.ragContext);
  } catch (error) {
    console.error("RAG lookup failed; continuing without semantic context.", { projectId, branchId }, error);
    return [];
  }
}

async function loadCharacterDigest(projectId: string, userInstructions: string) {
  const terms = extractSearchTerms(userInstructions);
  const searchWhere =
    terms.length > 0
      ? {
          OR: terms.flatMap((term) => [
            { name: { contains: term, mode: "insensitive" as const } },
            { role: { contains: term, mode: "insensitive" as const } },
            { memory: { contains: term, mode: "insensitive" as const } },
          ]),
        }
      : {};

  let characters = await prisma.character.findMany({
    where: { projectId, ...searchWhere },
    orderBy: { updatedAt: "desc" },
    take: terms.length > 0 ? 80 : 40,
    select: { name: true, role: true, memory: true, updatedAt: true },
  });

  if (characters.length === 0 && terms.length > 0) {
    characters = await prisma.character.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { name: true, role: true, memory: true, updatedAt: true },
    });
  }

  if (characters.length === 0) return "No characters defined yet.";

  const ranked = characters
    .map((character) => {
      const text = `${character.name} ${character.role} ${character.memory}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { ...character, score };
    })
    .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime());

  const lines = takeByCharBudget(
    ranked,
    (character) => `${character.name} (${character.role}) | Memory: ${character.memory}`,
    CONTEXT_BUDGETS.characterDigest,
  );

  return lines.length ? lines.join("\n") : "No characters defined yet.";
}

async function loadMostRecentChapterText(chapterId?: string) {
  if (!chapterId) return "No immediate previous text.";

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { content: true },
  });

  const text = stripHtml(chapter?.content ?? "");
  return text ? text.slice(-CONTEXT_BUDGETS.slidingWindow) : "No immediate previous text.";
}

export async function composeContext(
  projectId: string, 
  branchId: string, 
  userInstructions: string,
  fromRagService: (q: string, pId: string, bId: string, l: number, chapterIds?: string[]) => Promise<string[]> = async () => []
): Promise<PromptContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      summary: true,
      tone: true,
      audience: true,
      sharedNotes: true,
      worldRules: true,
      outline: true,
      branches: {
        select: {
          id: true,
          name: true,
          description: true,
          basedOnChapterId: true,
          highlights: true,
        },
      },
    },
  });

  if (!project) throw new Error("Project not found");

  const branch = project.branches.find((b) => b.id === branchId) || project.branches[0];
  if (!branch) throw new Error("Branch not found");

  const lineage = await buildContinuity(project, branch.id);
  const lineageChapterIds = lineage.map((chapter) => chapter.id);
  const currentChapterIndex = lineage.length + 1;
  const recentChapterSummaries = getRecentChapterSummaries(lineage);
  const mostRecentChapter = lineage[lineage.length - 1];

  const [ragContext, canonContext, characterDigest, slidingWindowText] = await Promise.all([
    loadRagContext(projectId, branch.id, userInstructions, fromRagService, lineageChapterIds),
    loadCanonPromptContext({ projectId, currentChapterIndex, userInstructions }),
    loadCharacterDigest(projectId, userInstructions),
    loadMostRecentChapterText(mostRecentChapter?.id),
  ]);

  return {
    projectName: project.name,
    projectSummary: project.summary,
    branchName: branch.name,
    branchDescription: branch.description,
    branchHighlights: normalizeStringList(branch.highlights),
    tone: project.tone,
    audience: project.audience,
    sharedNotes: project.sharedNotes,
    worldRules: takeByCharBudget(normalizeStringList(project.worldRules), (rule) => rule, CONTEXT_BUDGETS.worldRules),
    characterDigest,
    recentChapterSummaries,
    slidingWindowText,
    ragContext,
    outlineContext: buildLegacyOutlineContext(project.outline, currentChapterIndex),
    canonContext,
  };
}

async function buildContinuity(
  project: ContextProject,
  branchId: string,
  stopAtIndex?: number,
  seenBranchIds = new Set<string>(),
): Promise<ContextChapter[]> {
  if (seenBranchIds.has(branchId)) return [];
  seenBranchIds.add(branchId);

  const branch = project.branches.find((b) => b.id === branchId);
  
  let lineage: ContextChapter[] = [];
  if (branch && branch.basedOnChapterId !== "root") {
    const anchorChapter = await prisma.chapter.findFirst({
      where: { id: branch.basedOnChapterId, projectId: project.id },
      select: { id: true, branchId: true, index: true },
    });
    if (anchorChapter) {
      lineage = await buildContinuity(project, anchorChapter.branchId, anchorChapter.index, seenBranchIds);
    }
  }

  const currentBranch = await prisma.chapter.findMany({
    where: {
      projectId: project.id,
      branchId,
      ...(typeof stopAtIndex === "number" ? { index: { lte: stopAtIndex } } : {}),
    },
    orderBy: [{ index: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      branchId: true,
      title: true,
      summary: true,
      index: true,
      createdAt: true,
      summaryObj: { select: { summary: true } },
    },
  });

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
