"use server";

import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rateLimit";
import { composeContext } from "@/services/contextService";
import {
  generateChapter,
  rewriteSelection,
  describeSelection,
  generateSynopsisFromStoryBible,
  generateOutlineFromStoryBible,
  generateLongOutlineFromStoryBible,
} from "@/services/aiService";
import type { StoryBibleGenerationContext } from "@/services/aiService";
import * as z from "@/lib/validations";
import { semanticSearch } from "@/services/ragService";
import { refreshChapterContinuityStatus } from "@/services/continuityService";
import { prisma } from "@/lib/prisma";
import {
  requireBranchInProject,
  getProject,
  requireProjectPermission,
  updateContext,
  updateOutline,
  syncChaptersWithOutline,
} from "@/services/projectService";
import type { Prisma } from "@prisma/client";
import type { ProjectOutline } from "@/types/project";
import { normalizeStringList } from "@/lib/utils";

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 300,
  keyPrefix: "ai:action:",
});

const STORY_BIBLE_CONTEXT_BUDGETS = Object.freeze({
  characters: 10_000,
  chapters: 16_000,
  worldRules: 4_000,
});

function takeStringsByBudget(values: string[], budget: number) {
  const selected: string[] = [];
  let used = 0;

  for (const value of values) {
    const cleanValue = value.trim();
    if (!cleanValue) continue;
    const remaining = budget - used;
    if (remaining <= 0) break;
    const clipped = cleanValue.length > remaining ? `${cleanValue.slice(0, Math.max(0, remaining - 3))}...` : cleanValue;
    selected.push(clipped);
    used += clipped.length + 1;
  }

  return selected;
}

function takeCharactersByBudget(
  characters: Array<{ name: string; role: string; memory: string }>,
  budget: number,
) {
  const selected: Array<{ name: string; role: string; memory: string }> = [];
  let used = 0;

  for (const character of characters) {
    const header = `${character.name} (${character.role}): `;
    const remaining = budget - used - header.length;
    if (remaining <= 0) break;
    const memory = character.memory.length > remaining ? `${character.memory.slice(0, Math.max(0, remaining - 3))}...` : character.memory;
    selected.push({ ...character, memory });
    used += header.length + memory.length + 1;
  }

  return selected;
}

function takeChaptersByBudget(
  chapters: Array<{ title: string; summary: string }>,
  budget: number,
) {
  const selected: Array<{ title: string; summary: string }> = [];
  let used = 0;

  for (const [index, chapter] of chapters.entries()) {
    const header = `Chapter ${index + 1}: ${chapter.title} | `;
    const remaining = budget - used - header.length;
    if (remaining <= 0) break;
    const summary = chapter.summary.length > remaining ? `${chapter.summary.slice(0, Math.max(0, remaining - 3))}...` : chapter.summary;
    selected.push({ ...chapter, summary });
    used += header.length + summary.length + 1;
  }

  return selected;
}

async function buildStoryBibleContext(projectId: string): Promise<StoryBibleGenerationContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      summary: true,
      genre: true,
      tone: true,
      audience: true,
      sharedNotes: true,
      worldRules: true,
      characters: {
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { name: true, role: true, memory: true },
      },
      chapters: {
        orderBy: [{ index: "asc" }, { createdAt: "asc" }],
        select: { title: true, summary: true },
      },
    },
  });

  if (!project) throw new Error("Project not found");

  return {
    projectName: project.name,
    braindump: project.summary,
    genre: project.genre,
    tone: project.tone,
    audience: project.audience,
    synopsis: project.sharedNotes,
    worldRules: takeStringsByBudget(normalizeStringList(project.worldRules), STORY_BIBLE_CONTEXT_BUDGETS.worldRules),
    characters: takeCharactersByBudget(project.characters, STORY_BIBLE_CONTEXT_BUDGETS.characters),
    chapters: takeChaptersByBudget(project.chapters, STORY_BIBLE_CONTEXT_BUDGETS.chapters),
  };
}

function createOutlineId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function attachOutlineIds(outline: Awaited<ReturnType<typeof generateOutlineFromStoryBible>>["outline"]): ProjectOutline {
  return {
    acts: outline.acts.map((act) => ({
      id: createOutlineId("act"),
      title: act.title,
      summary: act.summary,
      chapters: act.chapters.map((chapter) => ({
        id: createOutlineId("chapter"),
        title: chapter.title,
        summary: chapter.summary,
      })),
    })),
  };
}

function attachLongOutlineIds(outline: Awaited<ReturnType<typeof generateLongOutlineFromStoryBible>>["outline"]): ProjectOutline {
  return {
    acts: outline.arcs.map((arc) => ({
      id: createOutlineId("act"),
      title: arc.title,
      summary: arc.summary,
      chapters: arc.beats.map((beat) => ({
        id: createOutlineId("chapter"),
        title: beat.title,
        summary: beat.summary,
      })),
    })),
  };
}

async function generateChapterAction(projectId: string, branchId: string, input: { title: string; instructions: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const headersList = await headers();
  const req = new Request("http://localhost", { headers: headersList });
  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) throw new Error("Too many requests");

  await requireProjectPermission(projectId, session.userId, "edit");
  await requireBranchInProject(projectId, branchId);

  const context = await composeContext(projectId, branchId, input.instructions, semanticSearch);
  const result = await generateChapter(input, context);

  const newChapter = await prisma.$transaction(async (tx) => {
    const chapterCount = await tx.chapter.count({ where: { projectId, branchId } });

    return tx.chapter.create({
      data: {
        projectId,
        branchId,
        title: result.title,
        summary: result.summary,
        content: result.content,
        index: chapterCount + 1,
        source: "ai",
        aiContext: context as unknown as Prisma.InputJsonValue,
      },
    });
  });

  const continuity = await refreshChapterContinuityStatus({
    chapterId: newChapter.id,
    projectId,
    branchId,
    title: newChapter.title,
    content: newChapter.content,
  });

  await prisma.usage.create({
    data: {
      projectId,
      action: "chapter_generation",
      tokens: result.tokens,
      costUsd: result.costUsd,
      model: result.model,
      actor: session.email,
    },
  });

  return { success: true, continuity };
}

export async function generateSynopsisAction(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const headersList = await headers();
  const req = new Request("http://localhost", { headers: headersList });
  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) throw new Error("Too many requests");

  await requireProjectPermission(projectId, session.userId, "edit");

  const result = await generateSynopsisFromStoryBible(await buildStoryBibleContext(projectId));
  const updatedProject = await updateContext(projectId, session.userId, {
    sharedNotes: result.synopsis,
  });

  await prisma.usage.create({
    data: {
      projectId,
      action: "synopsis_generation",
      tokens: result.tokens,
      costUsd: result.costUsd,
      model: result.model,
      actor: session.email,
    },
  });

  return updatedProject;
}

export async function generateOutlineAction(projectId: string, input?: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const headersList = await headers();
  const req = new Request("http://localhost", { headers: headersList });
  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) throw new Error("Too many requests");

  const parsed = z.OutlineRequestSchema.parse(input ?? {});
  await requireProjectPermission(projectId, session.userId, "edit");

  const result = await generateOutlineFromStoryBible(await buildStoryBibleContext(projectId), parsed.targetChapterCount);
  const updatedProject = await updateOutline(projectId, session.userId, attachOutlineIds(result.outline));

  await prisma.usage.create({
    data: {
      projectId,
      action: "outline_generation",
      tokens: result.tokens,
      costUsd: result.costUsd,
      model: result.model,
      actor: session.email,
    },
  });

  return updatedProject;
}

async function generateLongOutlineAction(projectId: string, input: unknown = {}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const headersList = await headers();
  const req = new Request("http://localhost", { headers: headersList });
  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) throw new Error("Too many requests");

  const parsed = z.LongOutlineRequestSchema.parse(input);
  await requireProjectPermission(projectId, session.userId, "edit");

  const result = await generateLongOutlineFromStoryBible(await buildStoryBibleContext(projectId), parsed.targetChapterCount);
  const legacyOutline = attachLongOutlineIds(result.outline);

  await prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.outlineBeat.deleteMany({ where: { projectId } }),
      tx.storyArc.deleteMany({ where: { projectId } }),
    ]);

    await Promise.all([
      Promise.all(
        result.outline.arcs.map(async (arc, index) => {
          const createdArc = await tx.storyArc.create({
            data: {
              projectId,
              title: arc.title,
              summary: arc.summary,
              startChapterIndex: arc.startChapterIndex,
              endChapterIndex: arc.endChapterIndex,
              sortOrder: index + 1,
            },
          });

          if (arc.beats.length > 0) {
            await tx.outlineBeat.createMany({
              data: arc.beats.map((beat) => ({
                projectId,
                arcId: createdArc.id,
                chapterIndex: beat.chapterIndex,
                title: beat.title,
                summary: beat.summary,
                focusEntities: beat.focusEntities as Prisma.InputJsonValue,
              })),
            });
          }
        })
      ),
      tx.project.update({
        where: { id: projectId },
        data: { outline: legacyOutline as unknown as Prisma.InputJsonValue },
      }),
    ]);

    await syncChaptersWithOutline(projectId, legacyOutline, tx);
  });

  await prisma.usage.create({
    data: {
      projectId,
      action: "long_outline_generation",
      tokens: result.tokens,
      costUsd: result.costUsd,
      model: result.model,
      actor: session.email,
    },
  });

  return getProject(projectId, session.userId);
}



export async function rewriteAction(projectId: string, branchId: string, input: { selection: string; instructions: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const headersList = await headers();
  const req = new Request("http://localhost", { headers: headersList });
  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) throw new Error("Too many requests");

  await requireProjectPermission(projectId, session.userId, "view");
  await requireBranchInProject(projectId, branchId);

  const context = await composeContext(projectId, branchId, input.instructions, semanticSearch);
  const { text, tokens, model } = await rewriteSelection(input, context);

  await prisma.usage.create({
    data: {
      projectId,
      action: "rewrite",
      tokens,
      costUsd: 0,
      model,
      actor: session.email,
    },
  });

  return { result: text };
}

export async function describeAction(projectId: string, branchId: string, input: { selection: string; sense: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const headersList = await headers();
  const req = new Request("http://localhost", { headers: headersList });
  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) throw new Error("Too many requests");

  await requireProjectPermission(projectId, session.userId, "view");
  await requireBranchInProject(projectId, branchId);

  const context = await composeContext(projectId, branchId, input.sense, semanticSearch);
  const { text, tokens, model } = await describeSelection(input, context);

  await prisma.usage.create({
    data: {
      projectId,
      action: "describe",
      tokens,
      costUsd: 0,
      model,
      actor: session.email,
    },
  });

  return { result: text };
}
