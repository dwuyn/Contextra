import { prisma } from "@/lib/prisma";
import * as z from "@/lib/validations";
import type { ProjectOutline } from "@/types/project";
import { refreshChapterContinuityStatus } from "@/services/continuityService";
import { requireFriendship } from "@/services/chatService";
import type { Prisma } from "@prisma/client";
import type {
  CreateChapterResult,
  HomeOverviewData,
  ProjectCommentThread,
  ProjectAiMessage,
  ProjectInvite,
  ProjectListItem,
  ProjectPresence,
  PublicProject,
  PublicProjectPage,
  RemoveProjectMemberResult,
  RestoreVersionResult,
  UpdateChapterResult,
} from "@/types/project";

type ProjectAccessLevel = "view" | "edit" | "manage";

type CreateProjectInput = {
  name: string;
  mode: string;
  genre: string;
  summary: string;
  isPublic?: boolean;
  coverImageUrl?: string;
};

type CreateChapterInput = {
  title: string;
  summary?: string;
  content?: string;
  branchId: string;
};

type UpdateChapterInput = {
  title?: string;
  summary?: string;
  content?: string;
  createVersion?: boolean;
};

type CreateBranchInput = {
  name: string;
  description?: string;
  basedOnChapterId: string;
};

type UpsertCharacterInput = {
  name: string;
  role: string;
  memory: string;
};

type UpdateContextInput = {
  tone?: string;
  audience?: string;
  sharedNotes?: string;
  worldRules?: unknown;
};

type UpdateOutlineInput = ProjectOutline;

type UpdateSettingsInput = {
  mode?: string;
  isPublic?: boolean;
  coverImageUrl?: string;
  summary?: string;
  genre?: string;
};

type AddCollaboratorInput = {
  friendUserId: string;
  permissionLevel: number;
};

type CreateProjectInviteInput = {
  receiverUserId: string;
  permissionLevel: number;
};

type RemoveProjectMemberInput = {
  memberUserId: string;
};

type RespondProjectInviteInput = {
  status: "accepted" | "declined";
};

type UpsertProjectPresenceInput = {
  chapterId?: string | null;
  state: "viewing" | "editing";
};

type CreateCommentThreadInput = {
  threadId: string;
  chapterId: string;
  selectedText: string;
  content: string;
  chapterContent: string;
};

type ReplyToCommentThreadInput = {
  content: string;
};

type UpdateCommentThreadStatusInput = {
  status: "open" | "resolved";
};

type SendProjectChatInput = {
  content: string;
  fileName?: string;
  fileUrl?: string;
};

const EMPTY_OUTLINE: ProjectOutline = { acts: [] };
const HOME_OVERVIEW_RECENT_PROJECTS_LIMIT = 6;
const HOME_OVERVIEW_PUBLIC_PROJECTS_LIMIT = 8;
const PUBLIC_PROJECTS_PAGE_SIZE = 24;
const PROJECT_AI_MESSAGES_LIMIT = 60;
const PROJECT_CARD_ORDER_BY = [{ updatedAt: "desc" }, { id: "desc" }] satisfies Prisma.ProjectOrderByWithRelationInput[];
const ACTIVE_PRESENCE_TTL_MS = 60_000;

type ProjectAccessSnapshot = {
  ownerId: string;
  isPublic: boolean;
  collaborators: Array<{
    userId: string;
    role: string;
    permissionLevel: number;
  }>;
};

type ViewerAccessState = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  isPublicViewer: boolean;
  permissionLevel: number | null;
  role: string;
};

const PROJECT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  profileImageUrl: true,
} satisfies Prisma.UserSelect;

function hasMeaningfulChapterContent(content?: string) {
  return Boolean(content?.replace(/<[^>]+>/g, " ").trim());
}

function stripHtmlToPlainText(content: string) {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getPresenceCutoff() {
  return new Date(Date.now() - ACTIVE_PRESENCE_TTL_MS);
}

function isStoryContentEqual(left: string, right: string) {
  return stripHtmlToPlainText(left) === stripHtmlToPlainText(right);
}

function toIsoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function toProjectInvite(invite: {
  id: string;
  projectId: string;
  senderUserId: string;
  receiverUserId: string;
  permissionLevel: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sender: { id: string; name: string; email: string; profileImageUrl: string | null };
  receiver: { id: string; name: string; email: string; profileImageUrl: string | null };
}): ProjectInvite {
  return {
    ...invite,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
    status: invite.status as ProjectInvite["status"],
  };
}

function toProjectPresence(presence: {
  id: string;
  projectId: string;
  userId: string;
  chapterId: string | null;
  state: string;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; email: string; profileImageUrl: string | null };
}): ProjectPresence {
  return {
    ...presence,
    state: presence.state as ProjectPresence["state"],
    lastActiveAt: presence.lastActiveAt.toISOString(),
    createdAt: presence.createdAt.toISOString(),
    updatedAt: presence.updatedAt.toISOString(),
  };
}

function toProjectCommentThread(thread: {
  id: string;
  projectId: string;
  chapterId: string;
  authorUserId: string;
  selectedText: string;
  status: string;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string; email: string; profileImageUrl: string | null };
  resolvedBy: { id: string; name: string; email: string; profileImageUrl: string | null } | null;
  replies: Array<{
    id: string;
    threadId: string;
    authorUserId: string;
    content: string;
    createdAt: Date;
    author: { id: string; name: string; email: string; profileImageUrl: string | null };
  }>;
}, isDetached = false): ProjectCommentThread {
  return {
    ...thread,
    status: thread.status as ProjectCommentThread["status"],
    resolvedAt: toIsoDate(thread.resolvedAt),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    replies: thread.replies.map((reply) => ({
      ...reply,
      createdAt: reply.createdAt.toISOString(),
    })),
    isDetached,
  };
}

function normalizeOutline(outline: unknown): ProjectOutline {
  const parsed = z.ProjectOutlineSchema.safeParse(outline);
  return parsed.success ? parsed.data : EMPTY_OUTLINE;
}

function getViewerAccess(project: ProjectAccessSnapshot, userId: string): ViewerAccessState {
  const membership = project.collaborators.find((collaborator) => collaborator.userId === userId);
  const canView = project.isPublic || Boolean(membership) || project.ownerId === userId;
  const role = project.ownerId === userId ? "owner" : membership?.role ?? "public-viewer";
  const permissionLevel = project.ownerId === userId ? 3 : membership?.permissionLevel ?? (project.isPublic ? 0 : null);

  return {
    canView,
    canEdit: (permissionLevel ?? 0) >= 2,
    canManage: (permissionLevel ?? 0) >= 3,
    isPublicViewer: !membership && project.ownerId !== userId,
    permissionLevel,
    role,
  };
}

function getProjectAiMessagesOrderBy(direction: Prisma.SortOrder) {
  return [{ createdAt: direction }, { id: direction }] satisfies Prisma.ProjectAiMessageOrderByWithRelationInput[];
}

function orderProjectAiMessagesAscending<T extends { createdAt: Date; id: string }>(messages: T[]) {
  return [...messages].sort((a, b) => {
    const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return a.id.localeCompare(b.id);
  });
}

function toProjectAiMessage(message: {
  id: string;
  projectId: string;
  branchId: string;
  authorUserId: string | null;
  role: string;
  content: string;
  createdAt: Date;
}): ProjectAiMessage {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
    role: message.role as ProjectAiMessage["role"],
  };
}

async function listProjectCards(userId: string, options: { take?: number } = {}): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    select: {
      id: true,
      name: true,
      mode: true,
      genre: true,
      summary: true,
      updatedAt: true,
      isPublic: true,
      coverImageUrl: true,
      collaborators: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
      _count: {
        select: {
          chapters: true,
          collaborators: true,
        },
      },
    },
    orderBy: PROJECT_CARD_ORDER_BY,
    ...(options.take ? { take: options.take } : {}),
  });

  const activeBranchCounts =
    projects.length === 0
      ? new Map<string, number>()
      : new Map(
          (
            await prisma.branch.groupBy({
              by: ["projectId"],
              where: {
                projectId: { in: projects.map((project) => project.id) },
                status: "active",
              },
              _count: { _all: true },
            })
          ).map((row) => [row.projectId, row._count._all])
        );

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    mode: project.mode,
    genre: project.genre,
    summary: project.summary,
    updatedAt: project.updatedAt.toISOString(),
    chapterCount: project._count.chapters,
    activeBranches: activeBranchCounts.get(project.id) ?? 0,
    collaboratorCount: project._count.collaborators,
    role: project.collaborators[0]?.role ?? "owner",
    isPublic: project.isPublic,
    coverImageUrl: project.coverImageUrl,
  }));
}

export async function requireProjectPermission(projectId: string, userId: string, level: ProjectAccessLevel) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      isPublic: true,
      collaborators: {
        where: { userId },
        select: {
          userId: true,
          role: true,
          permissionLevel: true,
        },
        take: 1,
      },
    },
  });

  if (!project) throw new Error("Unauthorized");

  const viewerAccess = getViewerAccess(project, userId);
  const allowed =
    level === "view"
      ? viewerAccess.canView
      : level === "edit"
        ? viewerAccess.canEdit
        : viewerAccess.canManage;

  if (!allowed) throw new Error("Unauthorized");
  return viewerAccess;
}

async function requireCollaborativeAccess(projectId: string, userId: string) {
  const viewerAccess = await requireProjectPermission(projectId, userId, "view");
  if (viewerAccess.isPublicViewer) {
    throw new Error("Collaborative access required");
  }
  return viewerAccess;
}

async function listProjectAudienceUserIds(projectId: string, excludeUserIds: string[] = []) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      collaborators: {
        select: { userId: true },
      },
    },
  });

  if (!project) return [];

  return [project.ownerId, ...project.collaborators.map((collaborator) => collaborator.userId)].filter(
    (id, index, ids) => !excludeUserIds.includes(id) && ids.indexOf(id) === index,
  );
}

export async function listProjects(userId: string) {
  return listProjectCards(userId);
}

export async function getHomeOverview(userId: string): Promise<HomeOverviewData> {
  const [recentProjects, publicProjects, pendingProjectInvites] = await Promise.all([
    listProjectCards(userId, { take: HOME_OVERVIEW_RECENT_PROJECTS_LIMIT }),
    prisma.project.findMany({
      where: {
        isPublic: true,
        ownerId: { not: userId },
        collaborators: { none: { userId } },
      },
      select: {
        id: true,
        name: true,
        summary: true,
        genre: true,
        updatedAt: true,
        coverImageUrl: true,
        owner: {
          select: { name: true },
        },
      },
      orderBy: PROJECT_CARD_ORDER_BY,
      take: HOME_OVERVIEW_PUBLIC_PROJECTS_LIMIT,
    }),
    prisma.projectInvite.findMany({
      where: {
        receiverUserId: userId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: {
          select: PROJECT_USER_SELECT,
        },
        project: {
          select: {
            id: true,
            name: true,
            summary: true,
          },
        },
      },
    }),
  ]);

  return {
    recentProjects,
    publicProjects: publicProjects.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      genre: p.genre,
      ownerName: p.owner.name,
      updatedAt: p.updatedAt.toISOString(),
      coverImageUrl: p.coverImageUrl,
    })),
    pendingProjectInvites: pendingProjectInvites.map((invite) => ({
      id: invite.id,
      projectId: invite.project.id,
      projectName: invite.project.name,
      projectSummary: invite.project.summary,
      permissionLevel: invite.permissionLevel,
      sender: invite.sender,
      createdAt: invite.createdAt.toISOString(),
    })),
  };
}

export async function getProject(projectId: string, userId: string) {
  const presenceCutoff = getPresenceCutoff();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      collaborators: {
        include: {
          user: {
            select: PROJECT_USER_SELECT,
          },
        },
        orderBy: [{ permissionLevel: "desc" }, { createdAt: "asc" }],
      },
      characters: true,
      canonProposals: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
      storyArcs: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      outlineBeats: {
        orderBy: [{ chapterIndex: "asc" }, { createdAt: "asc" }],
      },
      chapters: {
        select: {
          id: true,
          projectId: true,
          branchId: true,
          title: true,
          summary: true,
          index: true,
          source: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { index: "asc" },
      },
      branches: true,
      usage: { take: 100, orderBy: { createdAt: "desc" } },
      versions: { take: 100, orderBy: { createdAt: "desc" } },
      chatMessages: { take: 60, orderBy: { createdAt: "desc" } },
      invites: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        include: {
          sender: {
            select: PROJECT_USER_SELECT,
          },
          receiver: {
            select: PROJECT_USER_SELECT,
          },
        },
      },
      presence: {
        where: {
          lastActiveAt: {
            gte: presenceCutoff,
          },
        },
        orderBy: [{ state: "desc" }, { updatedAt: "desc" }],
        include: {
          user: {
            select: PROJECT_USER_SELECT,
          },
        },
      },
      aiMessages: {
        take: PROJECT_AI_MESSAGES_LIMIT,
        orderBy: getProjectAiMessagesOrderBy("desc"),
      },
    },
  });

  if (!project) return null;

  const viewerAccess = getViewerAccess(project, userId);
  if (!viewerAccess.canView) return null;

  const [currentUser, commentCounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: PROJECT_USER_SELECT,
    }),
    prisma.commentThread.groupBy({
      by: ["chapterId", "status"],
      where: { projectId },
      _count: { _all: true },
    }),
  ]);

  if (!currentUser) throw new Error("User not found");

  const chapterCommentCountMap = new Map<string, { openCount: number; totalCount: number }>();
  for (const row of commentCounts) {
    const current = chapterCommentCountMap.get(row.chapterId) ?? { openCount: 0, totalCount: 0 };
    current.totalCount += row._count._all;
    if (row.status === "open") {
      current.openCount += row._count._all;
    }
    chapterCommentCountMap.set(row.chapterId, current);
  }

  return {
    currentUser,
    metadata: {
      id: project.id,
      ownerId: project.ownerId,
      name: project.name,
      mode: project.mode,
      genre: project.genre,
      summary: project.summary,
      isPublic: project.isPublic,
      coverImageUrl: project.coverImageUrl,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    collaborators: project.collaborators.map((collaborator) => ({
      ...collaborator,
      createdAt: collaborator.createdAt.toISOString(),
    })),
    pendingInvites: project.invites.map(toProjectInvite),
    presence: project.presence.map(toProjectPresence),
    chapterCommentCounts: project.chapters.map((chapter) => {
      const counts = chapterCommentCountMap.get(chapter.id) ?? { openCount: 0, totalCount: 0 };
      return {
        chapterId: chapter.id,
        openCount: counts.openCount,
        totalCount: counts.totalCount,
      };
    }),
    characters: project.characters,
    canonProposals: project.canonProposals.map((proposal) => ({
      ...proposal,
      status: proposal.status as "pending" | "approved" | "rejected",
      createdAt: proposal.createdAt.toISOString(),
      reviewedAt: proposal.reviewedAt ? proposal.reviewedAt.toISOString() : null,
    })),
    storyArcs: project.storyArcs.map((arc) => ({
      ...arc,
      createdAt: arc.createdAt.toISOString(),
      updatedAt: arc.updatedAt.toISOString(),
    })),
    outlineBeats: project.outlineBeats.map((beat) => ({
      ...beat,
      createdAt: beat.createdAt.toISOString(),
      updatedAt: beat.updatedAt.toISOString(),
    })),
    chapters: project.chapters,
    branches: project.branches,
    contextMemory: {
      tone: project.tone,
      audience: project.audience,
      sharedNotes: project.sharedNotes,
      worldRules: project.worldRules,
      updatedAt: project.updatedAt.toISOString(),
    },
    outline: normalizeOutline(project.outline),
    usage: project.usage,
    versions: project.versions.map((v) => ({ id: v.id, label: v.label, createdAt: v.createdAt.toISOString() })),
    viewerAccess,
    aiMessages: orderProjectAiMessagesAscending(project.aiMessages).map(toProjectAiMessage),
    chatMessages: [...project.chatMessages].reverse().map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function requireHydratedProjectAccess(projectId: string, userId: string, level: ProjectAccessLevel) {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Unauthorized");

  const allowed =
    level === "view"
      ? project.viewerAccess.canView
      : level === "edit"
        ? project.viewerAccess.canEdit
        : project.viewerAccess.canManage;

  if (!allowed) throw new Error("Unauthorized");
  return project;
}

export async function requireBranchInProject(projectId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, projectId },
    select: { id: true },
  });
  if (!branch) throw new Error("Branch not found");
  return branch;
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const project = await prisma.$transaction(async (tx) => {
    const createdProject = await tx.project.create({
      data: {
        ownerId: userId,
        name: input.name,
        mode: input.mode,
        genre: input.genre,
        summary: input.summary,
        isPublic: input.isPublic ?? false,
        coverImageUrl: input.coverImageUrl,
      },
    });

    const mainBranch = await tx.branch.create({
      data: {
        projectId: createdProject.id,
        name: "Main",
        description: "Primary story line",
        basedOnChapterId: "root",
        status: "active",
      },
    });

    await tx.chapter.create({
      data: {
        projectId: createdProject.id,
        branchId: mainBranch.id,
        title: "Chapter 1",
        summary: "",
        content: "",
        index: 1,
      },
    });

    return createdProject;
  });

  return getProject(project.id, userId);
}

export async function createChapter(projectId: string, userId: string, input: CreateChapterInput): Promise<CreateChapterResult> {
  await requireProjectPermission(projectId, userId, "edit");
  await requireBranchInProject(projectId, input.branchId);

  const chapterCount = await prisma.chapter.count({ where: { projectId } });
  const chapter = await prisma.chapter.create({
    data: {
      projectId,
      branchId: input.branchId,
      title: input.title,
      summary: input.summary ?? "",
      content: input.content ?? "",
      index: chapterCount + 1,
    },
  });

  const continuity = hasMeaningfulChapterContent(chapter.content)
    ? await refreshChapterContinuityStatus({
        chapterId: chapter.id,
        projectId,
        branchId: chapter.branchId,
        title: chapter.title,
        content: chapter.content,
      })
    : { fresh: true as const };

  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Project not found");

  return { project, chapter, continuity };
}

export async function updateChapter(
  projectId: string,
  userId: string,
  chapterId: string,
  input: UpdateChapterInput,
): Promise<UpdateChapterResult> {
  await requireProjectPermission(projectId, userId, "edit");

  const existing = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true, branchId: true, title: true, summary: true, content: true },
  });
  if (!existing) throw new Error("Chapter not found");

  const nextTitle = input.title ?? existing.title;
  const nextSummary = input.summary ?? existing.summary;
  const nextContent = input.content ?? existing.content;
  const hasTitleChange = nextTitle !== existing.title;
  const hasSummaryChange = nextSummary !== existing.summary;
  const hasContentChange = nextContent !== existing.content;
  const hasStoryContentChange = !isStoryContentEqual(existing.content, nextContent);
  let shouldCreateVersion = false;

  if (input.createVersion && hasStoryContentChange) {
    const latestVersion = await prisma.chapterVersion.findFirst({
      where: { projectId, chapterId },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });

    shouldCreateVersion = !latestVersion || latestVersion.content !== nextContent;
  }

  if (!hasTitleChange && !hasSummaryChange && !hasContentChange && !shouldCreateVersion) {
    return { continuity: { fresh: true } };
  }

  if (hasTitleChange || hasSummaryChange || hasContentChange) {
    await prisma.chapter.update({
      where: { id: existing.id },
      data: {
        title: hasTitleChange ? nextTitle : undefined,
        content: hasContentChange ? nextContent : undefined,
        summary: hasSummaryChange ? nextSummary : undefined,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });
  }

  if (shouldCreateVersion) {
    await prisma.chapterVersion.create({
      data: { projectId, chapterId, content: nextContent, createdBy: userId },
    });
  }

  const continuity = hasStoryContentChange
    ? await refreshChapterContinuityStatus({
        chapterId: existing.id,
        projectId,
        branchId: existing.branchId,
        title: nextTitle,
        content: nextContent,
      })
    : { fresh: true as const };

  return { continuity };
}

export async function createBranch(projectId: string, userId: string, input: CreateBranchInput) {
  await requireProjectPermission(projectId, userId, "edit");

  if (input.basedOnChapterId !== "root") {
    const anchor = await prisma.chapter.findFirst({
      where: { id: input.basedOnChapterId, projectId },
      select: { id: true },
    });
    if (!anchor) throw new Error("Base chapter not found");
  }

  await prisma.branch.create({
    data: {
      projectId,
      name: input.name,
      description: input.description ?? "",
      basedOnChapterId: input.basedOnChapterId,
    },
  });

  return getProject(projectId, userId);
}

export async function mergeBranch(projectId: string, userId: string, branchId: string) {
  await requireProjectPermission(projectId, userId, "manage");

  const result = await prisma.branch.updateMany({
    where: { id: branchId, projectId },
    data: {
      status: "merged",
      mergedInto: "main",
    },
  });
  if (result.count === 0) throw new Error("Branch not found");

  return getProject(projectId, userId);
}

export async function upsertCharacter(projectId: string, userId: string, input: UpsertCharacterInput, characterId?: string) {
  await requireProjectPermission(projectId, userId, "edit");

  if (characterId) {
    const result = await prisma.character.updateMany({
      where: { id: characterId, projectId },
      data: {
        name: input.name,
        role: input.role,
        memory: input.memory,
      },
    });
    if (result.count === 0) throw new Error("Character not found");
  } else {
    await prisma.character.create({
      data: {
        projectId,
        name: input.name,
        role: input.role,
        memory: input.memory,
      },
    });
  }

  return getProject(projectId, userId);
}

export async function deleteCharacter(projectId: string, userId: string, characterId: string) {
  await requireProjectPermission(projectId, userId, "edit");

  const result = await prisma.character.deleteMany({
    where: { id: characterId, projectId },
  });
  if (result.count === 0) throw new Error("Character not found");

  return getProject(projectId, userId);
}

export async function updateContext(projectId: string, userId: string, input: UpdateContextInput) {
  await requireProjectPermission(projectId, userId, "edit");

  await prisma.project.update({
    where: { id: projectId },
    data: {
      tone: input.tone,
      audience: input.audience,
      sharedNotes: input.sharedNotes,
      worldRules: input.worldRules as Prisma.InputJsonValue | undefined,
    },
  });

  return getProject(projectId, userId);
}

export async function updateOutline(projectId: string, userId: string, input: UpdateOutlineInput) {
  await requireProjectPermission(projectId, userId, "edit");

  await prisma.project.update({
    where: { id: projectId },
    data: {
      outline: input as unknown as Prisma.InputJsonValue,
    },
  });

  return getProject(projectId, userId);
}

export async function updateSettings(projectId: string, userId: string, input: UpdateSettingsInput) {
  await requireProjectPermission(projectId, userId, "manage");

  await prisma.project.update({
    where: { id: projectId },
    data: {
      mode: input.mode,
      isPublic: input.isPublic,
      coverImageUrl: input.coverImageUrl,
      summary: input.summary,
      genre: input.genre,
    },
  });

  return getProject(projectId, userId);
}

export async function createProjectInvite(projectId: string, userId: string, input: CreateProjectInviteInput) {
  await requireProjectPermission(projectId, userId, "manage");

  if (input.receiverUserId === userId) {
    throw new Error("You are already on this project");
  }

  await requireFriendship(userId, input.receiverUserId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      collaborators: {
        where: {
          userId: input.receiverUserId,
        },
        select: { id: true },
        take: 1,
      },
      invites: {
        where: {
          receiverUserId: input.receiverUserId,
          status: "pending",
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!project) throw new Error("Project not found");
  if (project.ownerId === input.receiverUserId || project.collaborators.length > 0) {
    throw new Error("That user is already a collaborator");
  }
  if (project.invites.length > 0) {
    throw new Error("An invite is already pending for that collaborator");
  }

  const invite = await prisma.projectInvite.create({
    data: {
      projectId,
      senderUserId: userId,
      receiverUserId: input.receiverUserId,
      permissionLevel: input.permissionLevel,
    },
    include: {
      sender: {
        select: PROJECT_USER_SELECT,
      },
      receiver: {
        select: PROJECT_USER_SELECT,
      },
    },
  });

  const hydratedProject = await getProject(projectId, userId);
  if (!hydratedProject) throw new Error("Project not found");

  return {
    project: hydratedProject,
    invite: toProjectInvite(invite),
  };
}

export async function cancelProjectInvite(projectId: string, userId: string, inviteId: string) {
  await requireProjectPermission(projectId, userId, "manage");

  const invite = await prisma.projectInvite.findFirst({
    where: {
      id: inviteId,
      projectId,
      senderUserId: userId,
      status: "pending",
    },
    include: {
      sender: {
        select: PROJECT_USER_SELECT,
      },
      receiver: {
        select: PROJECT_USER_SELECT,
      },
    },
  });

  if (!invite) throw new Error("Invite not found");

  const updatedInvite = await prisma.projectInvite.update({
    where: { id: invite.id },
    data: { status: "canceled" },
    include: {
      sender: {
        select: PROJECT_USER_SELECT,
      },
      receiver: {
        select: PROJECT_USER_SELECT,
      },
    },
  });

  const hydratedProject = await getProject(projectId, userId);
  if (!hydratedProject) throw new Error("Project not found");

  return {
    project: hydratedProject,
    invite: toProjectInvite(updatedInvite),
  };
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
  input: RemoveProjectMemberInput,
): Promise<RemoveProjectMemberResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      collaborators: {
        where: {
          userId: {
            in: [...new Set([userId, input.memberUserId])],
          },
        },
        include: {
          user: {
            select: PROJECT_USER_SELECT,
          },
        },
      },
    },
  });

  if (!project) throw new Error("Project not found");

  const isOwner = project.ownerId === userId;
  const isSelfLeave = input.memberUserId === userId;
  const actingCollaborator = project.collaborators.find((collaborator) => collaborator.userId === userId) ?? null;
  const targetCollaborator = project.collaborators.find((collaborator) => collaborator.userId === input.memberUserId) ?? null;

  if (input.memberUserId === project.ownerId) {
    throw new Error(isOwner ? "Project owner cannot leave the project" : "Project owner cannot be removed");
  }

  if (isSelfLeave) {
    if (!actingCollaborator) {
      throw new Error("Collaborator not found");
    }
  } else {
    if (!isOwner) {
      throw new Error("Unauthorized");
    }
    if (!targetCollaborator) {
      throw new Error("Collaborator not found");
    }
  }

  const member = (isSelfLeave ? actingCollaborator : targetCollaborator) ?? null;
  if (!member) {
    throw new Error("Collaborator not found");
  }

  await prisma.$transaction([
    prisma.projectPresence.deleteMany({
      where: {
        projectId,
        userId: input.memberUserId,
      },
    }),
    prisma.collaborator.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: input.memberUserId,
        },
      },
    }),
  ]);

  return {
    project: isSelfLeave ? null : await getProject(projectId, userId),
    projectId: project.id,
    projectName: project.name,
    memberUserId: member.userId,
    memberName: member.user.name,
    ownerUserId: project.ownerId,
    kind: isSelfLeave ? "left" : "removed",
  };
}

export async function respondToProjectInvite(userId: string, inviteId: string, input: RespondProjectInviteInput) {
  const invite = await prisma.projectInvite.findFirst({
    where: {
      id: inviteId,
      receiverUserId: userId,
      status: "pending",
    },
    include: {
      sender: {
        select: PROJECT_USER_SELECT,
      },
      receiver: {
        select: PROJECT_USER_SELECT,
      },
    },
  });

  if (!invite) throw new Error("Invite not found");

  const updatedInvite = await prisma.$transaction(async (tx) => {
    const nextInvite = await tx.projectInvite.update({
      where: { id: invite.id },
      data: { status: input.status },
      include: {
        sender: {
          select: PROJECT_USER_SELECT,
        },
        receiver: {
          select: PROJECT_USER_SELECT,
        },
      },
    });

    if (input.status === "accepted") {
      const existingCollaborator = await tx.collaborator.findFirst({
        where: {
          projectId: invite.projectId,
          userId,
        },
        select: { id: true },
      });

      if (!existingCollaborator) {
        await tx.collaborator.create({
          data: {
            projectId: invite.projectId,
            userId,
            role: `level-${invite.permissionLevel}`,
            permissionLevel: invite.permissionLevel,
          },
        });
      }
    }

    return nextInvite;
  });

  const project = input.status === "accepted" ? await getProject(invite.projectId, userId) : null;

  return {
    project,
    invite: toProjectInvite(updatedInvite),
  };
}

export async function addCollaborator(projectId: string, userId: string, input: AddCollaboratorInput) {
  return createProjectInvite(projectId, userId, {
    receiverUserId: input.friendUserId,
    permissionLevel: input.permissionLevel,
  });
}

export async function upsertProjectPresence(projectId: string, userId: string, input: UpsertProjectPresenceInput) {
  const viewerAccess = await requireCollaborativeAccess(projectId, userId);

  if (input.chapterId) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: input.chapterId, projectId },
      select: { id: true },
    });
    if (!chapter) throw new Error("Chapter not found");
  }

  const nextState = viewerAccess.canEdit ? input.state : "viewing";
  const presence = await prisma.projectPresence.upsert({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
    create: {
      projectId,
      userId,
      chapterId: input.chapterId ?? null,
      state: nextState,
      lastActiveAt: new Date(),
    },
    update: {
      chapterId: input.chapterId ?? null,
      state: nextState,
      lastActiveAt: new Date(),
    },
    include: {
      user: {
        select: PROJECT_USER_SELECT,
      },
    },
  });

  return toProjectPresence(presence);
}

export async function leaveProjectPresence(projectId: string, userId: string) {
  await requireCollaborativeAccess(projectId, userId);

  await prisma.projectPresence.deleteMany({
    where: {
      projectId,
      userId,
    },
  });

  return { projectId, userId };
}

export async function listChapterCommentThreads(projectId: string, userId: string, chapterId: string) {
  await requireCollaborativeAccess(projectId, userId);

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { content: true },
  });
  if (!chapter) throw new Error("Chapter not found");

  const threads = await prisma.commentThread.findMany({
    where: {
      projectId,
      chapterId,
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      author: {
        select: PROJECT_USER_SELECT,
      },
      resolvedBy: {
        select: PROJECT_USER_SELECT,
      },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: PROJECT_USER_SELECT,
          },
        },
      },
    },
  });

  return threads.map((thread) =>
    toProjectCommentThread(thread, !chapter.content.includes(`data-comment-thread-id="${thread.id}"`)),
  );
}

export async function createCommentThread(projectId: string, userId: string, input: CreateCommentThreadInput) {
  await requireCollaborativeAccess(projectId, userId);

  const chapter = await prisma.chapter.findFirst({
    where: { id: input.chapterId, projectId },
    select: { id: true, content: true },
  });
  if (!chapter) throw new Error("Chapter not found");

  if (!isStoryContentEqual(chapter.content, input.chapterContent)) {
    throw new Error("Save chapter content before commenting");
  }

  const createdThread = await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapter.id },
      data: { content: input.chapterContent },
    });

    const thread = await tx.commentThread.create({
      data: {
        id: input.threadId,
        projectId,
        chapterId: input.chapterId,
        authorUserId: userId,
        selectedText: input.selectedText,
        replies: {
          create: {
            authorUserId: userId,
            content: input.content,
          },
        },
      },
      include: {
        author: {
          select: PROJECT_USER_SELECT,
        },
        resolvedBy: {
          select: PROJECT_USER_SELECT,
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: PROJECT_USER_SELECT,
            },
          },
        },
      },
    });

    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    return thread;
  });

  return toProjectCommentThread(createdThread);
}

export async function replyToCommentThread(projectId: string, userId: string, threadId: string, input: ReplyToCommentThreadInput) {
  await requireCollaborativeAccess(projectId, userId);

  const thread = await prisma.commentThread.findFirst({
    where: {
      id: threadId,
      projectId,
    },
    select: { id: true },
  });
  if (!thread) throw new Error("Comment thread not found");

  const updatedThread = await prisma.commentThread.update({
    where: { id: thread.id },
    data: {
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
      replies: {
        create: {
          authorUserId: userId,
          content: input.content,
        },
      },
    },
    include: {
      author: {
        select: PROJECT_USER_SELECT,
      },
      resolvedBy: {
        select: PROJECT_USER_SELECT,
      },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: PROJECT_USER_SELECT,
          },
        },
      },
    },
  });

  return toProjectCommentThread(updatedThread);
}

export async function updateCommentThreadStatus(
  projectId: string,
  userId: string,
  threadId: string,
  input: UpdateCommentThreadStatusInput,
) {
  await requireCollaborativeAccess(projectId, userId);

  const thread = await prisma.commentThread.findFirst({
    where: {
      id: threadId,
      projectId,
    },
    select: { id: true },
  });
  if (!thread) throw new Error("Comment thread not found");

  const updatedThread = await prisma.commentThread.update({
    where: { id: thread.id },
    data: {
      status: input.status,
      resolvedAt: input.status === "resolved" ? new Date() : null,
      resolvedByUserId: input.status === "resolved" ? userId : null,
    },
    include: {
      author: {
        select: PROJECT_USER_SELECT,
      },
      resolvedBy: {
        select: PROJECT_USER_SELECT,
      },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: PROJECT_USER_SELECT,
          },
        },
      },
    },
  });

  return toProjectCommentThread(updatedThread);
}

export async function listProjectAudience(projectId: string, excludeUserIds: string[] = []) {
  return listProjectAudienceUserIds(projectId, excludeUserIds);
}

export async function sendProjectChat(projectId: string, userId: string, input: SendProjectChatInput) {
  await requireProjectPermission(projectId, userId, "view");

  await prisma.chatMessage.create({
    data: {
      projectId,
      senderId: userId,
      content: input.content,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
    },
  });

  const messages = await prisma.chatMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return messages.reverse();
}

export async function createProjectAiMessage(input: {
  projectId: string;
  branchId: string;
  authorUserId?: string | null;
  role: "user" | "assistant";
  content: string;
}) {
  return prisma.projectAiMessage.create({
    data: {
      projectId: input.projectId,
      branchId: input.branchId,
      authorUserId: input.authorUserId ?? null,
      role: input.role,
      content: input.content,
    },
  });
}

export async function listProjectAiMessages(projectId: string, take = PROJECT_AI_MESSAGES_LIMIT) {
  const messages = await prisma.projectAiMessage.findMany({
    where: { projectId },
    take,
    orderBy: getProjectAiMessagesOrderBy("desc"),
  });

  return orderProjectAiMessagesAscending(messages).map(toProjectAiMessage);
}

export async function listPublicProjects(userId: string, page = 1): Promise<PublicProjectPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const publicProjects = await prisma.project.findMany({
    where: {
      isPublic: true,
      ownerId: { not: userId },
      collaborators: { none: { userId } },
    },
    select: {
      id: true,
      name: true,
      summary: true,
      genre: true,
      updatedAt: true,
      coverImageUrl: true,
      owner: {
        select: { name: true },
      },
    },
    orderBy: PROJECT_CARD_ORDER_BY,
    skip: (safePage - 1) * PUBLIC_PROJECTS_PAGE_SIZE,
    take: PUBLIC_PROJECTS_PAGE_SIZE + 1,
  });

  const hasMore = publicProjects.length > PUBLIC_PROJECTS_PAGE_SIZE;
  const items: PublicProject[] = publicProjects.slice(0, PUBLIC_PROJECTS_PAGE_SIZE).map((p) => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    genre: p.genre,
    ownerName: p.owner.name,
    updatedAt: p.updatedAt.toISOString(),
    coverImageUrl: p.coverImageUrl,
    isPublic: true,
    role: "viewer",
  }));

  return {
    items,
    page: safePage,
    hasMore,
  };
}

export async function getChapterContent(projectId: string, userId: string, chapterId: string) {
  await requireProjectPermission(projectId, userId, "view");

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { content: true }
  });

  if (!chapter) throw new Error("Chapter not found");
  return chapter.content;
}

export async function reorderChapters(projectId: string, userId: string, orderedIds: string[]) {
  await requireProjectPermission(projectId, userId, "edit");

  const uniqueIds = [...new Set(orderedIds)];
  if (uniqueIds.length !== orderedIds.length) throw new Error("Duplicate chapter IDs");

  const chapters = await prisma.chapter.findMany({
    where: { id: { in: uniqueIds }, projectId },
    select: { id: true, branchId: true },
  });
  if (chapters.length !== uniqueIds.length) throw new Error("Chapter not found");
  if (new Set(chapters.map((chapter) => chapter.branchId)).size > 1) {
    throw new Error("Cannot reorder chapters across branches");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.chapter.update({ where: { id }, data: { index: index + 1 } })
    )
  );

  return getProject(projectId, userId);
}

export async function deleteChapter(projectId: string, userId: string, chapterId: string) {
  await requireProjectPermission(projectId, userId, "edit");

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true, branchId: true },
  });
  if (!chapter) throw new Error("Chapter not found");

  await prisma.$transaction(async (tx) => {
    await tx.chapterVersion.deleteMany({
      where: { projectId, chapterId },
    });

    await tx.branch.updateMany({
      where: { projectId, basedOnChapterId: chapterId },
      data: { basedOnChapterId: "root" },
    });

    await tx.chapter.delete({
      where: { id: chapterId },
    });

    const remainingBranchChapters = await tx.chapter.findMany({
      where: { projectId, branchId: chapter.branchId },
      orderBy: [{ index: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    if (remainingBranchChapters.length > 0) {
      await Promise.all(
        remainingBranchChapters.map((remainingChapter, index) =>
          tx.chapter.update({
            where: { id: remainingChapter.id },
            data: { index: index + 1 },
          })
        )
      );
    }

    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });
  });

  return getProject(projectId, userId);
}

export async function getChapterVersions(projectId: string, userId: string, chapterId: string) {
  await requireProjectPermission(projectId, userId, "view");

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true },
  });
  if (!chapter) throw new Error("Chapter not found");

  return prisma.chapterVersion.findMany({
    where: { projectId, chapterId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, content: true, createdBy: true, createdAt: true },
  });
}

export async function restoreVersion(
  projectId: string,
  userId: string,
  chapterId: string,
  versionId: string,
): Promise<RestoreVersionResult> {
  await requireProjectPermission(projectId, userId, "edit");

  const version = await prisma.chapterVersion.findFirst({ where: { id: versionId, projectId, chapterId } });
  if (!version) throw new Error("Version not found");

  // Snapshot the current content first
  const current = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true, branchId: true, title: true, content: true },
  });
  if (!current) throw new Error("Chapter not found");
  if (current.content && current.content !== version.content) {
    await prisma.chapterVersion.create({ data: { projectId, chapterId, content: current.content, createdBy: userId } });
  }

  await prisma.chapter.update({ where: { id: current.id }, data: { content: version.content } });
  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  const continuity = await refreshChapterContinuityStatus({
    chapterId: current.id,
    projectId,
    branchId: current.branchId,
    title: current.title,
    content: version.content,
  });

  return {
    content: version.content,
    continuity,
  };
}
