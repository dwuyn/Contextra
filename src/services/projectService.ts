import "@/lib/server-only";

import { prisma } from "@/lib/prisma";
import * as z from "@/lib/validations";
import { createCollaborationToken } from "@/lib/collaboration/auth";
import { getChapterDocumentName, parseChapterDocumentName } from "@/lib/collaboration/document";
import type { ProjectOutline } from "@/types/project";
import { deleteChapterIllustrationObject, deleteChapterIllustrationObjects, readChapterIllustrationObject, storeChapterIllustration } from "@/lib/chapterIllustrationStorage";
import { refreshChapterContinuityStatus } from "@/services/continuityService";
import { generateChapterIllustrationAsset, getChapterIllustrationUsageModelLabel, hasMeaningfulIllustrationSource } from "@/services/chapterIllustrationService";
import { requireFriendship } from "@/services/chatService";
import { writeCharacterVector, invalidateContextCache } from "@/services/contextService";
import { Prisma } from "@prisma/client";
import type {
  ChapterIllustrationMeta,
  CreateChapterResult,
  HomeOverviewData,
  ProjectCommentThread,
  ProjectAiMessage,
  ProjectCollaborationSession,
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

type GenerateChapterIllustrationInput = ReturnType<typeof z.GenerateChapterIllustrationSchema.parse>;

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
const COLLABORATION_USER_COLORS = [
  "#2563eb",
  "#0891b2",
  "#0f766e",
  "#16a34a",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#4f46e5",
] as const;

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

import { stripHtml } from "@/lib/utils";

function getPresenceCutoff() {
  return new Date(Date.now() - ACTIVE_PRESENCE_TTL_MS);
}

function isStoryContentEqual(left: string, right: string) {
  return stripHtml(left) === stripHtml(right);
}

function toIsoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildChapterIllustrationUrl(projectId: string, chapterId: string, generatedAt: Date) {
  return `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/illustration?v=${generatedAt.getTime()}`;
}

function toChapterIllustrationMeta(chapter: {
  projectId: string;
  id: string;
  illustrationPrompt: string | null;
  illustrationModel: string | null;
  illustrationGeneratedAt: Date | null;
}): ChapterIllustrationMeta | null {
  if (!chapter.illustrationPrompt || !chapter.illustrationModel || !chapter.illustrationGeneratedAt) {
    return null;
  }

  return {
    url: buildChapterIllustrationUrl(chapter.projectId, chapter.id, chapter.illustrationGeneratedAt),
    prompt: chapter.illustrationPrompt,
    model: chapter.illustrationModel,
    generatedAt: chapter.illustrationGeneratedAt.toISOString(),
  };
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

function getCollaborationUserColor(userId: string) {
  let hash = 0;
  for (const char of userId) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }

  return COLLABORATION_USER_COLORS[Math.abs(hash) % COLLABORATION_USER_COLORS.length];
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
  return [...messages].toSorted((a, b) => {
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

  if (!project) throw new Error("Project not found");

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

export async function getChapterCollaborationAccess(projectId: string, userId: string, chapterId: string) {
  const [viewerAccess, chapter, user] = await Promise.all([
    requireCollaborativeAccess(projectId, userId),
    prisma.chapter.findFirst({
      where: { id: chapterId, projectId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: PROJECT_USER_SELECT,
    }),
  ]);

  if (!chapter) throw new Error("Chapter not found");
  if (!user) throw new Error("User not found");

  return {
    viewerAccess,
    user,
  };
}

export async function createChapterCollaborationSession(
  projectId: string,
  userId: string,
  chapterId: string,
  websocketUrl: string,
): Promise<ProjectCollaborationSession> {
  const { viewerAccess, user } = await getChapterCollaborationAccess(projectId, userId, chapterId);
  const readOnly = !viewerAccess.canEdit;

  return {
    documentName: getChapterDocumentName(chapterId),
    websocketUrl,
    token: await createCollaborationToken({
      userId: user.id,
      projectId,
      chapterId,
      name: user.name,
      profileImageUrl: user.profileImageUrl,
      readOnly,
    }),
    readOnly,
    user: {
      id: user.id,
      name: user.name,
      color: getCollaborationUserColor(user.id),
      profileImageUrl: user.profileImageUrl,
    },
  };
}

export async function getChapterCollaborationBootstrap(documentName: string) {
  const { chapterId } = parseChapterDocumentName(documentName);
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      projectId: true,
      branchId: true,
      title: true,
      content: true,
      updatedAt: true,
    },
  });

  if (!chapter) {
    throw new Error("Chapter not found");
  }

  return chapter;
}

export async function getChapterCollaborationState(chapterId: string) {
  return prisma.chapterCollaborationState.findUnique({
    where: { chapterId },
    select: {
      chapterId: true,
      projectId: true,
      state: true,
      formatVersion: true,
      updatedAt: true,
    },
  });
}

export async function saveChapterCollaborationState(projectId: string, chapterId: string, state: Uint8Array) {
  await prisma.chapterCollaborationState.upsert({
    where: { chapterId },
    create: {
      chapterId,
      projectId,
      state: Buffer.from(state),
    },
    update: {
      projectId,
      state: Buffer.from(state),
    },
  });
}

export async function syncCollaborativeChapterContent(projectId: string, chapterId: string, content: string) {
  const existing = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true, branchId: true, title: true, content: true },
  });
  if (!existing) throw new Error("Chapter not found");

  if (existing.content === content) {
    return { continuity: { fresh: true as const }, updated: false };
  }

  await Promise.all([
    prisma.chapter.update({
      where: { id: existing.id },
      data: { content },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  const hasStoryContentChange = !isStoryContentEqual(existing.content, content);
  const continuity = hasStoryContentChange
    ? await refreshChapterContinuityStatus({
        chapterId: existing.id,
        projectId,
        branchId: existing.branchId,
        title: existing.title,
        content,
      })
    : { fresh: true as const };

  return {
    continuity,
    updated: true,
  };
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

export async function getProject(projectId: string, userId: string, branchId?: string) {
  const accessSnapshot = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      isPublic: true,
      collaborators: {
        select: {
          userId: true,
          role: true,
          permissionLevel: true,
        },
      },
      branches: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!accessSnapshot) return null;

  const viewerAccess = getViewerAccess(accessSnapshot, userId);
  if (!viewerAccess.canView) return null;

  const defaultBranch = accessSnapshot.branches.find((b) => b.name === "Main") || accessSnapshot.branches[0];
  const targetBranchId = branchId || defaultBranch?.id;

  const presenceCutoff = getPresenceCutoff();

  if (viewerAccess.isPublicViewer) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        mode: true,
        genre: true,
        summary: true,
        isPublic: true,
        coverImageUrl: true,
        createdAt: true,
        updatedAt: true,
        tone: true,
        audience: true,
        sharedNotes: true,
        worldRules: true,
        outline: true,
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImageUrl: true,
              },
            },
          },
          orderBy: [{ permissionLevel: "desc" }, { createdAt: "asc" }],
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
            illustrationPrompt: true,
            illustrationModel: true,
            illustrationGeneratedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { index: "asc" },
        },
        branches: true,
      },
    });

    if (!project) return null;

    const [currentUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          profileImageUrl: true,
        },
      }),
    ]);

    if (!currentUser) throw new Error("User not found");

    const mappedCurrentUser = {
      ...currentUser,
      email: undefined as string | undefined,
    };

    return {
      currentUser: mappedCurrentUser,
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
        user: {
          id: collaborator.user.id,
          name: collaborator.user.name,
          profileImageUrl: collaborator.user.profileImageUrl,
          email: undefined as string | undefined,
        },
      })),
      pendingInvites: [],
      presence: [],
      chapterCommentCounts: [],
      characters: [],
      canonProposals: [],
      storyArcs: [],
      outlineBeats: [],
      chapters: project.chapters.map((chapter) => ({
        ...chapter,
        illustration: toChapterIllustrationMeta(chapter),
      })),
      branches: project.branches,
      contextMemory: {
        tone: project.tone,
        audience: project.audience,
        sharedNotes: project.sharedNotes,
        worldRules: project.worldRules,
        updatedAt: project.updatedAt.toISOString(),
      },
      outline: normalizeOutline(project.outline),
      usage: [],
      versions: [],
      viewerAccess,
      aiMessages: [],
      chatMessages: [],
    };
  }

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
          illustrationPrompt: true,
          illustrationModel: true,
          illustrationGeneratedAt: true,
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
        where: targetBranchId ? { branchId: targetBranchId } : undefined,
        take: PROJECT_AI_MESSAGES_LIMIT,
        orderBy: getProjectAiMessagesOrderBy("desc"),
      },
    },
  });

  if (!project) return null;

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

  const baseResult = {
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
    chapters: project.chapters.map((chapter) => ({
      ...chapter,
      illustration: toChapterIllustrationMeta(chapter),
    })),
    branches: project.branches,
    contextMemory: {
      tone: project.tone,
      audience: project.audience,
      sharedNotes: project.sharedNotes,
      worldRules: project.worldRules,
      updatedAt: project.updatedAt.toISOString(),
    },
    outline: normalizeOutline(project.outline),
    versions: project.versions.map((v) => ({ id: v.id, label: v.label, createdAt: v.createdAt.toISOString() })),
    viewerAccess,
    aiMessages: orderProjectAiMessagesAscending(project.aiMessages).map(toProjectAiMessage),
    chatMessages: [...project.chatMessages].reverse().map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  };

  if (!viewerAccess.canManage) {
    return {
      ...baseResult,
      pendingInvites: [],
      usage: [],
    };
  }

  return {
    ...baseResult,
    pendingInvites: project.invites.map(toProjectInvite),
    usage: project.usage,
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

  const chapter = await prisma.$transaction(async (tx) => {
    // Lock chapters of this branch in this project for update to prevent concurrent index allocation races
    const lastChapter = await tx.$queryRaw<Array<{ max_index: number | null }>>`
      SELECT max(index) as max_index FROM "Chapter" 
      WHERE "projectId" = ${projectId} AND "branchId" = ${input.branchId} 
      FOR UPDATE
    `;
    const nextIndex = (lastChapter[0]?.max_index ?? 0) + 1;

    const createdChapter = await tx.chapter.create({
      data: {
        projectId,
        branchId: input.branchId,
        title: input.title,
        summary: input.summary ?? "",
        content: input.content ?? "",
        index: nextIndex,
      },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });
    return createdChapter;
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

  return {
    project,
    chapter: {
      ...chapter,
      illustration: null,
    },
    continuity,
  };
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
    return { continuity: { fresh: true }, contentChanged: false };
  }

  if (hasTitleChange || hasSummaryChange || hasContentChange) {
    await Promise.all([
      prisma.chapter.update({
        where: { id: existing.id },
        data: {
          title: hasTitleChange ? nextTitle : undefined,
          content: hasContentChange ? nextContent : undefined,
          summary: hasSummaryChange ? nextSummary : undefined,
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      }),
    ]);
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

  return {
    continuity,
    contentChanged: hasContentChange,
  };
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

  await prisma.$transaction([
    prisma.branch.create({
      data: {
        projectId,
        name: input.name,
        description: input.description ?? "",
        basedOnChapterId: input.basedOnChapterId,
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return getProject(projectId, userId);
}

export async function mergeBranch(projectId: string, userId: string, branchId: string) {
  await requireProjectPermission(projectId, userId, "manage");

  const [result] = await prisma.$transaction([
    prisma.branch.updateMany({
      where: { id: branchId, projectId },
      data: {
        status: "merged",
        mergedInto: "main",
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  if (result.count === 0) throw new Error("Branch not found");

  return getProject(projectId, userId);
}

export async function upsertCharacter(projectId: string, userId: string, input: UpsertCharacterInput, characterId?: string) {
  await requireProjectPermission(projectId, userId, "edit");

  let savedId = characterId;

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
    const created = await prisma.character.create({
      data: {
        projectId,
        name: input.name,
        role: input.role,
        memory: input.memory,
      },
    });
    savedId = created.id;
  }

  await writeCharacterVector(savedId!, input.name, input.role, input.memory);

  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  return getProject(projectId, userId);
}

export async function deleteCharacter(projectId: string, userId: string, characterId: string) {
  await requireProjectPermission(projectId, userId, "edit");

  const result = await prisma.character.deleteMany({
    where: { id: characterId, projectId },
  });
  if (result.count === 0) throw new Error("Character not found");

  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

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

export async function renameProject(projectId: string, userId: string, name: string) {
  await requireProjectPermission(projectId, userId, "manage");
  await prisma.project.update({
    where: { id: projectId },
    data: { name },
  });
  invalidateContextCache(projectId);
}

export async function createProjectInvite(projectId: string, userId: string, input: CreateProjectInviteInput) {
  if (input.receiverUserId === userId) {
    throw new Error("You are already on this project");
  }

  await Promise.all([
    requireProjectPermission(projectId, userId, "manage"),
    requireFriendship(userId, input.receiverUserId),
  ]);

  const invite = await prisma.$transaction(async (tx) => {
    // Lock any existing pending invite for this project and receiver to prevent concurrent invitation races
    await tx.$queryRaw`
      SELECT id FROM "ProjectInvite" 
      WHERE "projectId" = ${projectId} AND "receiverUserId" = ${input.receiverUserId} AND "status" = 'pending' 
      FOR UPDATE
    `;

    const project = await tx.project.findUnique({
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

    const newInvite = await tx.projectInvite.create({
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

    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    return newInvite;
  });

  const hydratedProject = await getProject(invite.projectId, userId);
  if (!hydratedProject) throw new Error("Project not found");

  return {
    invite: toProjectInvite(invite),
    project: hydratedProject,
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

  const updatedInvite = await prisma.$transaction(async (tx) => {
    const nextInvite = await tx.projectInvite.update({
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

    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    return nextInvite;
  });

  const hydratedProject = await getProject(updatedInvite.projectId, userId);
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
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
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

    await tx.project.update({
      where: { id: invite.projectId },
      data: { updatedAt: new Date() },
    });

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
    select: { id: true },
  });
  if (!chapter) throw new Error("Chapter not found");

  const createdThread = await prisma.$transaction(async (tx) => {
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

export async function deleteProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      name: true,
      collaborators: {
        select: { userId: true },
      },
      chapters: {
        where: {
          illustrationObjectPath: {
            not: null,
          },
        },
        select: {
          illustrationObjectPath: true,
        },
      },
    },
  });

  if (!project) throw new Error("Project not found");
  if (project.ownerId !== userId) throw new Error("Only the project owner can delete the project");

  const collaboratorUserIds = project.collaborators.map((c) => c.userId);
  const illustrationObjectPaths = project.chapters
    .map((chapter) => chapter.illustrationObjectPath)
    .filter((value): value is string => Boolean(value));

  await prisma.project.delete({
    where: { id: projectId },
  });

  if (illustrationObjectPaths.length > 0) {
    await deleteChapterIllustrationObjects(illustrationObjectPaths).catch((error) => {
      console.error("Failed to delete project illustrations:", error);
    });
  }

  invalidateContextCache(projectId);

  return {
    projectId,
    projectName: project.name,
    collaboratorUserIds,
  };
}

export async function sendProjectChat(projectId: string, userId: string, input: SendProjectChatInput) {
  const [, createdMessage] = await Promise.all([
    requireProjectPermission(projectId, userId, "edit"),
    prisma.chatMessage.create({
      data: {
        projectId,
        senderId: userId,
        content: input.content,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
      },
    }),
  ]);

  const messages = await prisma.chatMessage.findMany({
    where: { projectId: createdMessage.projectId },
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

export async function listProjectAiMessages(projectId: string, branchId: string, take = PROJECT_AI_MESSAGES_LIMIT) {
  const messages = await prisma.projectAiMessage.findMany({
    where: { projectId, branchId },
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

export async function getChapterIllustration(projectId: string, userId: string, chapterId: string) {
  await requireProjectPermission(projectId, userId, "view");

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: {
      id: true,
      projectId: true,
      illustrationObjectPath: true,
      illustrationPrompt: true,
      illustrationModel: true,
      illustrationGeneratedAt: true,
    },
  });

  if (!chapter) {
    throw new Error("Chapter not found");
  }

  if (!chapter.illustrationObjectPath) {
    throw new Error("Illustration not found");
  }

  const asset = await readChapterIllustrationObject(chapter.illustrationObjectPath);

  return {
    ...asset,
    illustration: toChapterIllustrationMeta(chapter),
  };
}

export async function generateChapterIllustration(
  projectId: string,
  userId: string,
  chapterId: string,
  input: GenerateChapterIllustrationInput,
) {
  await requireProjectPermission(projectId, userId, "edit");

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: {
      id: true,
      projectId: true,
      illustrationObjectPath: true,
    },
  });

  if (!chapter) {
    throw new Error("Chapter not found");
  }

  if (!hasMeaningfulIllustrationSource(input.chapterContent)) {
    throw new Error("Add some chapter content before generating an illustration.");
  }

  const generatedAsset = await generateChapterIllustrationAsset({
    projectId,
    chapterTitle: input.chapterTitle,
    chapterContent: input.chapterContent,
    customInstruction: input.customInstruction,
  });

  const storedAsset = await storeChapterIllustration({
    projectId,
    chapterId,
    contentType: generatedAsset.contentType,
    bytes: generatedAsset.bytes,
  });

  const generatedAt = new Date();

  try {
    const updatedChapter = await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        illustrationObjectPath: storedAsset.objectPath,
        illustrationMimeType: storedAsset.contentType,
        illustrationPrompt: generatedAsset.prompt,
        illustrationModel: generatedAsset.model,
        illustrationGeneratedAt: generatedAt,
      },
      select: {
        id: true,
        projectId: true,
        illustrationPrompt: true,
        illustrationModel: true,
        illustrationGeneratedAt: true,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: generatedAt },
    });

    if (generatedAsset.tokens > 0) {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      await prisma.usage.create({
        data: {
          projectId,
          action: "chapter_illustration",
          tokens: generatedAsset.tokens,
          costUsd: 0,
          model: getChapterIllustrationUsageModelLabel(generatedAsset.model),
          actor: actor?.email ?? userId,
        },
      });
    }

    if (chapter.illustrationObjectPath && chapter.illustrationObjectPath !== storedAsset.objectPath) {
      await deleteChapterIllustrationObject(chapter.illustrationObjectPath).catch((error) => {
        console.error("Failed to delete previous chapter illustration:", error);
      });
    }

    return toChapterIllustrationMeta(updatedChapter);
  } catch (error) {
    await deleteChapterIllustrationObject(storedAsset.objectPath).catch((cleanupError) => {
      console.error("Failed to clean up replacement illustration after DB error:", cleanupError);
    });
    throw error;
  }
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

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "Chapter" AS c SET "index" = v.index
      FROM (VALUES ${Prisma.join(orderedIds.map((id, index) => Prisma.sql`(${id}, ${index + 1})`))}) AS v(id, index)
      WHERE c.id = v.id
    `,
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return getProject(projectId, userId);
}

export async function deleteChapter(projectId: string, userId: string, chapterId: string) {
  const [, chapter] = await Promise.all([
    requireProjectPermission(projectId, userId, "edit"),
    prisma.chapter.findFirst({
      where: { id: chapterId, projectId },
      select: { id: true, branchId: true, illustrationObjectPath: true },
    }),
  ]);
  if (!chapter) throw new Error("Chapter not found");

  await prisma.$transaction(async (tx) => {
    const [, , deletedChapter] = await Promise.all([
      tx.chapterVersion.deleteMany({
        where: { projectId, chapterId },
      }),
      tx.branch.updateMany({
        where: { projectId, basedOnChapterId: chapterId },
        data: { basedOnChapterId: "root" },
      }),
      tx.chapter.delete({
        where: { id: chapterId },
        select: { branchId: true },
      }),
    ]);

    const remainingBranchChapters = await tx.chapter.findMany({
      where: { projectId, branchId: deletedChapter.branchId },
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

  if (chapter.illustrationObjectPath) {
    await deleteChapterIllustrationObject(chapter.illustrationObjectPath).catch((error) => {
      console.error("Failed to delete chapter illustration:", error);
    });
  }

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

export async function getChapterVersionForRestore(projectId: string, userId: string, chapterId: string, versionId: string) {
  await requireProjectPermission(projectId, userId, "edit");

  const version = await prisma.chapterVersion.findFirst({
    where: { id: versionId, projectId, chapterId },
    select: { id: true, content: true },
  });
  if (!version) throw new Error("Version not found");

  return version;
}

export async function createChapterVersionSnapshot(projectId: string, chapterId: string, userId: string, content: string) {
  await requireProjectPermission(projectId, userId, "edit");

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true },
  });
  if (!chapter) throw new Error("Chapter not found");

  const latestVersion = await prisma.chapterVersion.findFirst({
    where: { projectId, chapterId },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });

  if (latestVersion?.content === content) {
    return { created: false as const };
  }

  await prisma.chapterVersion.create({
    data: {
      projectId,
      chapterId,
      content,
      createdBy: userId,
    },
  });

  return { created: true as const };
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

  await Promise.all([
    prisma.chapter.update({ where: { id: current.id }, data: { content: version.content } }),
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

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
