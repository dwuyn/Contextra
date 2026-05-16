"use server";

import { getSession } from "@/lib/auth";
import { composeContext } from "@/services/contextService";
import {
  generateChapter,
  rewriteSelection,
  describeSelection,
  generateSynopsisFromStoryBible,
  generateOutlineFromStoryBible,
} from "@/services/aiService";
import { semanticSearch } from "@/services/ragService";
import { refreshChapterContinuityStatus } from "@/services/continuityService";
import { prisma } from "@/lib/prisma";
import {
  requireBranchInProject,
  requireHydratedProjectAccess,
  requireProjectPermission,
  updateContext,
  updateOutline,
} from "@/services/projectService";
import type { Prisma } from "@prisma/client";
import type { ProjectOutline } from "@/types/project";

function buildStoryBibleContext(project: Awaited<ReturnType<typeof requireHydratedProjectAccess>>) {
  return {
    projectName: project.metadata.name,
    braindump: project.metadata.summary,
    genre: project.metadata.genre,
    tone: project.contextMemory.tone,
    audience: project.contextMemory.audience,
    synopsis: project.contextMemory.sharedNotes,
    worldRules: Array.isArray(project.contextMemory.worldRules)
      ? project.contextMemory.worldRules.filter((rule): rule is string => typeof rule === "string")
      : [],
    characters: project.characters.map((character) => ({
      name: character.name,
      role: character.role,
      memory: character.memory,
    })),
    chapters: project.chapters.map((chapter) => ({
      title: chapter.title,
      summary: chapter.summary,
    })),
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

export async function generateChapterAction(projectId: string, branchId: string, input: { title: string; instructions: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await requireProjectPermission(projectId, session.userId, "edit");
  await requireBranchInProject(projectId, branchId);

  const context = await composeContext(projectId, branchId, input.instructions, semanticSearch);
  const result = await generateChapter(input, context);

  const chapterCount = await prisma.chapter.count({ where: { projectId } });
  
  const newChapter = await prisma.chapter.create({
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

  const continuity = await refreshChapterContinuityStatus({
    chapterId: newChapter.id,
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
  const project = await requireHydratedProjectAccess(projectId, session.userId, "edit");

  const result = await generateSynopsisFromStoryBible(buildStoryBibleContext(project));
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

export async function generateOutlineAction(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const project = await requireHydratedProjectAccess(projectId, session.userId, "edit");

  const result = await generateOutlineFromStoryBible(buildStoryBibleContext(project));
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



export async function rewriteAction(projectId: string, branchId: string, input: { selection: string; instructions: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await requireProjectPermission(projectId, session.userId, "view");
  await requireBranchInProject(projectId, branchId);

  const context = await composeContext(projectId, branchId, input.instructions, semanticSearch);
  const result = await rewriteSelection(input, context);

  return { result };
}

export async function describeAction(projectId: string, branchId: string, input: { selection: string; sense: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await requireProjectPermission(projectId, session.userId, "view");
  await requireBranchInProject(projectId, branchId);

  const context = await composeContext(projectId, branchId, input.sense, semanticSearch);
  const result = await describeSelection(input, context);

  return { result };
}
