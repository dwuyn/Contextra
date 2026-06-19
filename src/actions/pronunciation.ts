"use server";

import * as projectService from "@/services/projectService";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as z from "@/lib/validations";

export async function listPronunciationEntries(projectId: string, language: "en-US" | "vi-VN") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await projectService.requireProjectPermission(projectId, session.userId, "view");

  const entries = await prisma.pronunciationEntry.findMany({
    where: { projectId, language },
    orderBy: [{ priority: "desc" }, { term: "asc" }],
    select: {
      id: true,
      term: true,
      replacement: true,
      renderMode: true,
      matchMode: true,
      caseSensitive: true,
      priority: true,
      enabled: true,
      source: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return entries;
}

export async function createPronunciationEntry(input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const parsed = z.CreatePronunciationEntrySchema.parse(input);

  await projectService.requireProjectPermission(parsed.projectId, session.userId, "edit");

  try {
    const entry = await prisma.pronunciationEntry.create({
      data: {
        projectId: parsed.projectId,
        language: parsed.language,
        term: parsed.term,
        replacement: parsed.replacement,
        renderMode: parsed.renderMode,
        matchMode: parsed.matchMode,
        caseSensitive: parsed.caseSensitive,
        priority: parsed.priority,
        source: "manual",
        notes: parsed.notes,
      },
    });

    revalidatePath("/");
    return entry;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      throw new Error(
        `A pronunciation entry already exists for term "${parsed.term}" with match mode "${parsed.matchMode}" in this project and language.`,
      );
    }
    throw error;
  }
}

export async function updatePronunciationEntry(input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const parsed = z.UpdatePronunciationEntrySchema.parse(input);

  const existing = await prisma.pronunciationEntry.findUnique({
    where: { id: parsed.id },
    select: { projectId: true },
  });

  if (!existing) {
    throw new Error("Pronunciation entry not found");
  }

  await projectService.requireProjectPermission(existing.projectId, session.userId, "edit");

  const entry = await prisma.pronunciationEntry.update({
    where: { id: parsed.id },
    data: {
      ...(parsed.term !== undefined && { term: parsed.term }),
      ...(parsed.replacement !== undefined && { replacement: parsed.replacement }),
      ...(parsed.renderMode !== undefined && { renderMode: parsed.renderMode }),
      ...(parsed.matchMode !== undefined && { matchMode: parsed.matchMode }),
      ...(parsed.caseSensitive !== undefined && { caseSensitive: parsed.caseSensitive }),
      ...(parsed.priority !== undefined && { priority: parsed.priority }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
    },
  });

  revalidatePath("/");
  return entry;
}

export async function deletePronunciationEntry(id: string, projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await projectService.requireProjectPermission(projectId, session.userId, "edit");

  const existing = await prisma.pronunciationEntry.findUnique({
    where: { id },
    select: { projectId: true },
  });

  if (!existing) {
    throw new Error("Pronunciation entry not found");
  }

  if (existing.projectId !== projectId) {
    throw new Error("Pronunciation entry does not belong to this project");
  }

  await prisma.pronunciationEntry.delete({ where: { id } });

  revalidatePath("/");
}

export async function togglePronunciationEntry(id: string, projectId: string, enabled: boolean) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await projectService.requireProjectPermission(projectId, session.userId, "edit");

  const existing = await prisma.pronunciationEntry.findUnique({
    where: { id },
    select: { projectId: true },
  });

  if (!existing) {
    throw new Error("Pronunciation entry not found");
  }

  if (existing.projectId !== projectId) {
    throw new Error("Pronunciation entry does not belong to this project");
  }

  const entry = await prisma.pronunciationEntry.update({
    where: { id },
    data: { enabled },
  });

  revalidatePath("/");
  return entry;
}

export async function importPronunciationSuggestions(projectId: string, language: "en-US" | "vi-VN") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await projectService.requireProjectPermission(projectId, session.userId, "edit");

  // Get existing terms to avoid duplicates
  const existingEntries = await prisma.pronunciationEntry.findMany({
    where: { projectId, language },
    select: { term: true, matchMode: true },
  });

  const existingKeys = new Set(
    existingEntries.map((e) => `${e.term}|${e.matchMode}`),
  );

  let importedCount = 0;

  // Pull from Character.name (source: "character")
  const characters = await prisma.character.findMany({
    where: { projectId },
    select: { name: true },
  });

  const characterCreates: ReturnType<typeof prisma.pronunciationEntry.create>[] = [];
  for (const character of characters) {
    const key = `${character.name}|whole_word`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      characterCreates.push(
        prisma.pronunciationEntry.create({
          data: {
            projectId,
            language,
            term: character.name,
            replacement: character.name,
            renderMode: "sub",
            matchMode: "whole_word",
            caseSensitive: false,
            priority: 0,
            enabled: false,
            source: "character",
          },
        }),
      );
    }
  }

  importedCount += characterCreates.length;

  // Pull from CanonEntity.name (source: "canon_entity")
  const canonEntities = await prisma.canonEntity.findMany({
    where: { projectId },
    select: { name: true },
  });

  const canonEntityCreates: ReturnType<typeof prisma.pronunciationEntry.create>[] = [];
  for (const entity of canonEntities) {
    const key = `${entity.name}|whole_word`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      canonEntityCreates.push(
        prisma.pronunciationEntry.create({
          data: {
            projectId,
            language,
            term: entity.name,
            replacement: entity.name,
            renderMode: "sub",
            matchMode: "whole_word",
            caseSensitive: false,
            priority: 0,
            enabled: false,
            source: "canon_entity",
          },
        }),
      );
    }
  }

  importedCount += canonEntityCreates.length;

  // Pull from CanonEntity.aliases (source: "canon_alias")
  const canonEntitiesWithAliases = await prisma.canonEntity.findMany({
    where: { projectId },
    select: { aliases: true },
  });

  const aliasCreates: ReturnType<typeof prisma.pronunciationEntry.create>[] = [];
  for (const entity of canonEntitiesWithAliases) {
    const aliases = entity.aliases as string[] | undefined;
    if (!aliases) continue;

    for (const alias of aliases) {
      const key = `${alias}|whole_word`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        aliasCreates.push(
          prisma.pronunciationEntry.create({
            data: {
              projectId,
              language,
              term: alias,
              replacement: alias,
              renderMode: "sub",
              matchMode: "whole_word",
              caseSensitive: false,
              priority: 0,
              enabled: false,
              source: "canon_alias",
            },
          }),
        );
      }
    }
  }

  importedCount += aliasCreates.length;

  await Promise.all([...characterCreates, ...canonEntityCreates, ...aliasCreates]);

  revalidatePath("/");
  return { importedCount };
}
