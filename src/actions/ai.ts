"use server";

import { getSession } from "@/lib/auth";
import { composeContext } from "@/services/contextService";
import { generateChapter, rewriteSelection, describeSelection } from "@/services/aiService";
import { processAndSaveChapterChunks, semanticSearch } from "@/services/ragService";
import { compressChapter } from "@/services/memoryService";
import { prisma } from "@/lib/prisma";

export async function generateChapterAction(projectId: string, branchId: string, input: { title: string; instructions: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

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
      aiContext: context as any,
    },
  });

  // Automatically trigger chunking and summarization in the background
  processAndSaveChapterChunks(newChapter.id, newChapter.content).catch(console.error);
  compressChapter(newChapter.id).catch(console.error);

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

  return { success: true };
}



export async function rewriteAction(projectId: string, branchId: string, input: { selection: string; instructions: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const context = await composeContext(projectId, branchId, input.instructions, semanticSearch);
  const result = await rewriteSelection(input, context);

  return { result };
}

export async function describeAction(projectId: string, branchId: string, input: { selection: string; sense: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const context = await composeContext(projectId, branchId, input.sense, semanticSearch);
  const result = await describeSelection(input, context);

  return { result };
}
