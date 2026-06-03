"use server";

import * as projectService from "@/services/projectService";
import * as chatService from "@/services/chatService";
import {
  approveCanonProposal as approveCanonProposalService,
  rejectCanonProposal as rejectCanonProposalService,
} from "@/services/canonService";
import { enqueueProjectContinuityJobs } from "@/services/continuityJobService";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as z from "@/lib/validations";
import { sendEvent } from "@/lib/realtime";
import type { CreateChapterResult, RemoveProjectMemberResult, RestoreVersionResult, UpdateChapterResult } from "@/types/project";

async function sendProjectNotice(senderId: string, receiverId: string, content: string) {
  try {
    const message = await chatService.sendDirectMessage(senderId, receiverId, content);
    sendEvent(receiverId, "new_message", message);
  } catch (error) {
    console.error("Failed to send project collaboration notice", error);
  }
}

async function fanOutProjectEvent(projectId: string, event: string, data: unknown, excludeUserIds: string[] = []) {
  const audience = await projectService.listProjectAudience(projectId, excludeUserIds);
  for (const userId of audience) {
    sendEvent(userId, event, data);
  }
}

export async function listProjects() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.listProjects(session.userId);
}

export async function listPublicProjects(page?: number) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.listPublicProjects(session.userId, page);
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

export async function createProject(input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateProjectSchema.parse(input);
  const result = await projectService.createProject(session.userId, parsed);
  revalidatePath("/");
  return result;
}

export async function createChapter(projectId: string, input: unknown): Promise<CreateChapterResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateChapterSchema.parse(input);
  const result = await projectService.createChapter(projectId, session.userId, parsed);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateChapter(projectId: string, chapterId: string, input: unknown): Promise<UpdateChapterResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateChapterSchema.parse(input);
  const { revalidate = true, ...chapterInput } = parsed;
  const result = await projectService.updateChapter(projectId, session.userId, chapterId, chapterInput);
  if (revalidate) {
    revalidatePath("/");
    revalidatePath(`/project/${projectId}`);
  }
  return result;
}

export async function createBranch(projectId: string, input: unknown) {
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

export async function upsertCharacter(projectId: string, input: unknown, characterId?: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpsertCharacterSchema.parse(input);
  const result = await projectService.upsertCharacter(projectId, session.userId, parsed, characterId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function deleteCharacter(projectId: string, characterId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.deleteCharacter(projectId, session.userId, characterId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateContext(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateContextSchema.parse(input);
  const result = await projectService.updateContext(projectId, session.userId, parsed);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateOutline(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateOutlineSchema.parse(input);
  const result = await projectService.updateOutline(projectId, session.userId, parsed);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function approveCanonProposal(projectId: string, proposalId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await projectService.requireProjectPermission(projectId, session.userId, "edit");
  await approveCanonProposalService(projectId, proposalId, session.userId);
  const result = await projectService.getProject(projectId, session.userId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function rejectCanonProposal(projectId: string, proposalId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await projectService.requireProjectPermission(projectId, session.userId, "edit");
  await rejectCanonProposalService(projectId, proposalId, session.userId);
  const result = await projectService.getProject(projectId, session.userId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function refreshProjectMemoryAction(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  await projectService.requireProjectPermission(projectId, session.userId, "edit");

  const chapters = await prisma.chapter.findMany({
    where: { projectId },
    orderBy: [{ index: "asc" }, { createdAt: "asc" }],
    select: { id: true, branchId: true },
  });

  await enqueueProjectContinuityJobs({ projectId, chapters });

  const result = await projectService.getProject(projectId, session.userId);
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function updateSettings(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateProjectSettingsSchema.parse(input);
  const result = await projectService.updateSettings(projectId, session.userId, parsed);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function renameProject(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.RenameProjectSchema.parse(input);
  await projectService.renameProject(projectId, session.userId, parsed.name);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
}

export async function addCollaborator(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.AddCollaboratorSchema.parse(input);
  const result = await projectService.addCollaborator(projectId, session.userId, parsed);
  await sendProjectNotice(
    session.userId,
    result.invite.receiverUserId,
    `${session.name} invited you to collaborate on "${result.project.metadata.name}".`,
  );
  sendEvent(result.invite.receiverUserId, "project_invite_created", {
    projectId,
    invite: result.invite,
    projectName: result.project.metadata.name,
    projectSummary: result.project.metadata.summary,
  });
  revalidatePath(`/project/${projectId}`);
  revalidatePath("/");
  return result;
}

export async function createProjectInvite(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateProjectInviteSchema.parse(input);
  const result = await projectService.createProjectInvite(projectId, session.userId, parsed);
  await sendProjectNotice(
    session.userId,
    result.invite.receiverUserId,
    `${session.name} invited you to collaborate on "${result.project.metadata.name}".`,
  );
  sendEvent(result.invite.receiverUserId, "project_invite_created", {
    projectId,
    invite: result.invite,
    projectName: result.project.metadata.name,
    projectSummary: result.project.metadata.summary,
  });
  revalidatePath(`/project/${projectId}`);
  revalidatePath("/");
  return result;
}

export async function cancelProjectInvite(projectId: string, inviteId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.cancelProjectInvite(projectId, session.userId, inviteId);
  sendEvent(result.invite.receiverUserId, "project_invite_updated", {
    projectId,
    invite: result.invite,
  });
  revalidatePath(`/project/${projectId}`);
  revalidatePath("/");
  return result;
}

export async function removeProjectMember(projectId: string, input: unknown): Promise<RemoveProjectMemberResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.RemoveProjectMemberSchema.parse(input);
  const result = await projectService.removeProjectMember(projectId, session.userId, parsed);

  if (result.kind === "removed") {
    await sendProjectNotice(
      session.userId,
      result.memberUserId,
      `${session.name} removed you from "${result.projectName}".`,
    );
  } else {
    await sendProjectNotice(
      session.userId,
      result.ownerUserId,
      `${session.name} left "${result.projectName}".`,
    );
  }

  await fanOutProjectEvent(
    projectId,
    "project_member_removed",
    {
      projectId,
      memberUserId: result.memberUserId,
      kind: result.kind,
    },
    [...new Set([session.userId, result.memberUserId])],
  );

  sendEvent(result.memberUserId, "project_access_revoked", {
    projectId,
    projectName: result.projectName,
    kind: result.kind,
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath("/");
  return result;
}

export async function respondToProjectInvite(inviteId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.RespondProjectInviteSchema.parse(input);
  const result = await projectService.respondToProjectInvite(session.userId, inviteId, parsed);
  const actionLabel = parsed.status === "accepted" ? "accepted" : "declined";
  await sendProjectNotice(
    session.userId,
    result.invite.senderUserId,
    `${session.name} ${actionLabel} your collaboration invite for "${result.project?.metadata.name ?? "your project"}".`,
  );

  if (parsed.status === "accepted") {
    await fanOutProjectEvent(result.invite.projectId, "project_invite_updated", {
      projectId: result.invite.projectId,
      invite: result.invite,
    });
  } else {
    sendEvent(result.invite.senderUserId, "project_invite_updated", {
      projectId: result.invite.projectId,
      invite: result.invite,
    });
  }

  revalidatePath("/");
  revalidatePath(`/project/${result.invite.projectId}`);
  return result;
}

export async function upsertProjectPresence(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpsertProjectPresenceSchema.parse(input);
  const presence = await projectService.upsertProjectPresence(projectId, session.userId, parsed);
  await fanOutProjectEvent(
    projectId,
    "project_presence_updated",
    { projectId, userId: session.userId, presence },
    [session.userId],
  );
  return presence;
}

export async function leaveProjectPresence(projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.leaveProjectPresence(projectId, session.userId);
  await fanOutProjectEvent(
    projectId,
    "project_presence_updated",
    { projectId, userId: session.userId, presence: null },
    [session.userId],
  );
  return result;
}

export async function getChapterCommentThreads(projectId: string, chapterId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.listChapterCommentThreads(projectId, session.userId, chapterId);
}

export async function createCommentThread(projectId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.CreateCommentThreadSchema.parse(input);
  const thread = await projectService.createCommentThread(projectId, session.userId, parsed);
  await fanOutProjectEvent(
    projectId,
    "project_comment_created",
    { projectId, thread },
    [session.userId],
  );
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return thread;
}

export async function replyToCommentThread(projectId: string, threadId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.ReplyToCommentThreadSchema.parse(input);
  const thread = await projectService.replyToCommentThread(projectId, session.userId, threadId, parsed);
  await fanOutProjectEvent(
    projectId,
    "project_comment_updated",
    { projectId, thread },
    [session.userId],
  );
  revalidatePath(`/project/${projectId}`);
  return thread;
}

export async function updateCommentThreadStatus(projectId: string, threadId: string, input: unknown) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const parsed = z.UpdateCommentThreadStatusSchema.parse(input);
  const thread = await projectService.updateCommentThreadStatus(projectId, session.userId, threadId, parsed);
  await fanOutProjectEvent(
    projectId,
    "project_comment_updated",
    { projectId, thread },
    [session.userId],
  );
  revalidatePath(`/project/${projectId}`);
  return thread;
}

export async function sendProjectChat(projectId: string, input: unknown) {
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

export async function deleteChapter(projectId: string, chapterId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.deleteChapter(projectId, session.userId, chapterId);
  revalidatePath("/");
  revalidatePath(`/project/${projectId}`);
  return result;
}

export async function getChapterVersions(projectId: string, chapterId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return projectService.getChapterVersions(projectId, session.userId, chapterId);
}

export async function restoreVersion(projectId: string, chapterId: string, versionId: string): Promise<RestoreVersionResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await projectService.restoreVersion(projectId, session.userId, chapterId, versionId);
  revalidatePath(`/project/${projectId}`);
  return result;
}
