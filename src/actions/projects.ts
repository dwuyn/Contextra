"use server";

import * as projectService from "@/services/projectService";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import * as z from "@/lib/validations";

export async function listProjects() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.listProjects(session.userId);
}

export async function listPublicProjects() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.listPublicProjects(session.userId);
}

export async function getHomeOverview() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.getHomeOverview(session.userId);
}

export async function getProject(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.getProject(projectId, session.userId);
}

export async function createProject(input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateProjectSchema.parse(input);
  const result = await projectService.createProject(session.userId, parsed);
  revalidatePath("/");
  return result;
}

export async function createChapter(projectId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateChapterSchema.parse(input);
  const result = await projectService.createChapter(projectId, session.userId, parsed);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateChapter(projectId: string, chapterId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateChapterSchema.parse(input);
  const result = await projectService.updateChapter(projectId, session.userId, chapterId, parsed);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function createBranch(projectId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateBranchSchema.parse(input);
  const result = await projectService.createBranch(projectId, session.userId, parsed);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function mergeBranch(projectId: string, branchId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.mergeBranch(projectId, session.userId, branchId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function upsertCharacter(projectId: string, input: any, characterId?: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpsertCharacterSchema.parse(input);
  const result = await projectService.upsertCharacter(projectId, session.userId, parsed, characterId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateContext(projectId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateContextSchema.parse(input);
  const result = await projectService.updateContext(projectId, session.userId, parsed);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateSettings(projectId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateProjectSettingsSchema.parse(input);
  const result = await projectService.updateSettings(projectId, session.userId, parsed);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function addCollaborator(projectId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.AddCollaboratorSchema.parse(input);
  const result = await projectService.addCollaborator(projectId, session.userId, parsed);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function sendProjectChat(projectId: string, input: any) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.SendProjectChatSchema.parse(input);
  const result = await projectService.sendProjectChat(projectId, session.userId, parsed);
  revalidatePath(`/project/${projectId}`);
  return result;
}
export async function getChapterContent(projectId: string, chapterId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.getChapterContent(projectId, session.userId, chapterId);
}

export async function reorderChapters(projectId: string, orderedIds: string[]) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.reorderChapters(projectId, session.userId, orderedIds);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function getChapterVersions(projectId: string, chapterId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.getChapterVersions(projectId, session.userId, chapterId);
}

export async function restoreVersion(projectId: string, chapterId: string, versionId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const content = await projectService.restoreVersion(projectId, session.userId, chapterId, versionId);
  revalidatePath(`/project/${projectId}`);
  return content;
}
