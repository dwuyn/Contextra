import { prisma } from "@/lib/prisma";
import { composeContext, exportProject } from "./contextService";

export async function listProjects(userId: string) {
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    include: {
      collaborators: true,
      chapters: { select: { id: true } },
      branches: { where: { status: "active" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((p) => {
    const membership = p.collaborators.find((c) => c.userId === userId);
    return {
      id: p.id,
      name: p.name,
      mode: p.mode,
      genre: p.genre,
      summary: p.summary,
      updatedAt: p.updatedAt.toISOString(),
      chapterCount: p.chapters.length,
      activeBranches: p.branches.length,
      collaboratorCount: p.collaborators.length,
      role: membership?.role ?? "owner",
      isPublic: p.isPublic,
      coverImageUrl: p.coverImageUrl,
    };
  });
}

export async function getHomeOverview(userId: string) {
  const projects = await listProjects(userId);
  const publicProjects = await prisma.project.findMany({
    where: { 
      isPublic: true,
      ownerId: { not: userId },
      collaborators: { none: { userId } }
    },
    include: { owner: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return {
    recentProjects: projects.slice(0, 6),
    publicProjects: publicProjects.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      genre: p.genre,
      ownerName: p.owner.name,
      updatedAt: p.updatedAt.toISOString(),
      coverImageUrl: p.coverImageUrl,
    })),
  };
}

export async function getProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      collaborators: true,
      characters: true,
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
        orderBy: { index: "asc" } 
      },
      branches: true,
      usage: { orderBy: { createdAt: "desc" } },
      versions: { orderBy: { createdAt: "desc" } },
      chatMessages: { take: 60, orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) return null;

  const membership = project.collaborators.find((c) => c.userId === userId);
  const canView = project.isPublic || !!membership || project.ownerId === userId;

  if (!canView) return null;

  const role = project.ownerId === userId ? "owner" : membership?.role ?? "public-viewer";
  const permissionLevel = project.ownerId === userId ? 3 : membership?.permissionLevel ?? (project.isPublic ? 0 : null);

  return {
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
    collaborators: project.collaborators,
    characters: project.characters,
    chapters: project.chapters,
    branches: project.branches,
    contextMemory: {
      tone: project.tone,
      audience: project.audience,
      sharedNotes: project.sharedNotes,
      worldRules: project.worldRules,
      updatedAt: project.updatedAt.toISOString(),
    },
    usage: project.usage,
    versions: project.versions.map((v) => ({ id: v.id, label: v.label, createdAt: v.createdAt.toISOString() })),
    viewerAccess: {
      canView,
      canEdit: (permissionLevel ?? 0) >= 2,
      canManage: (permissionLevel ?? 0) >= 3,
      isPublicViewer: !membership && project.ownerId !== userId,
      permissionLevel,
      role,
    },
    chatMessages: project.chatMessages,
  };
}

export async function createProject(userId: string, input: any) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const project = await prisma.project.create({
    data: {
      ownerId: userId,
      name: input.name,
      mode: input.mode,
      genre: input.genre,
      summary: input.summary,
      isPublic: input.isPublic ?? false,
      coverImageUrl: input.coverImageUrl,
      branches: {
        create: {
          name: "Main",
          description: "Primary story line",
          basedOnChapterId: "root",
          status: "active",
        },
      },
    },
  });

  return getProject(project.id, userId);
}

export async function createChapter(projectId: string, userId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  const chapterCount = await prisma.chapter.count({ where: { projectId } });
  await prisma.chapter.create({
    data: {
      projectId,
      branchId: input.branchId,
      title: input.title,
      summary: input.summary,
      content: input.content,
      index: chapterCount + 1,
    },
  });

  return getProject(projectId, userId);
}

export async function updateChapter(projectId: string, userId: string, chapterId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  // Snapshot current content as a version before overwriting
  if (input.content !== undefined) {
    const existing = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { content: true } });
    if (existing?.content) {
      await prisma.chapterVersion.create({
        data: { projectId, chapterId, content: existing.content, createdBy: userId },
      });
    }
  }

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      title: input.title,
      content: input.content,
      summary: input.summary,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  return getProject(projectId, userId);
}

export async function createBranch(projectId: string, userId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  await prisma.branch.create({
    data: {
      projectId,
      name: input.name,
      description: input.description,
      basedOnChapterId: input.basedOnChapterId,
    },
  });

  return getProject(projectId, userId);
}

export async function mergeBranch(projectId: string, userId: string, branchId: string) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canManage) throw new Error("Unauthorized");

  await prisma.branch.update({
    where: { id: branchId },
    data: {
      status: "merged",
      mergedInto: "main",
    },
  });

  return getProject(projectId, userId);
}

export async function upsertCharacter(projectId: string, userId: string, input: any, characterId?: string) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  if (characterId) {
    await prisma.character.update({
      where: { id: characterId },
      data: {
        name: input.name,
        role: input.role,
        memory: input.memory,
      },
    });
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

export async function updateContext(projectId: string, userId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  await prisma.project.update({
    where: { id: projectId },
    data: {
      tone: input.tone,
      audience: input.audience,
      sharedNotes: input.sharedNotes,
      worldRules: input.worldRules,
    },
  });

  return getProject(projectId, userId);
}

export async function updateSettings(projectId: string, userId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canManage) throw new Error("Unauthorized");

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

export async function addCollaborator(projectId: string, userId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canManage) throw new Error("Unauthorized");

  const friend = await prisma.user.findUnique({ where: { id: input.friendUserId } });
  if (!friend) throw new Error("Friend not found");

  await prisma.collaborator.create({
    data: {
      projectId,
      userId: input.friendUserId,
      role: `level-${input.permissionLevel}`,
      permissionLevel: input.permissionLevel,
    },
  });

  return getProject(projectId, userId);
}

export async function sendProjectChat(projectId: string, userId: string, input: any) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canView) throw new Error("Unauthorized");

  await prisma.chatMessage.create({
    data: {
      projectId,
      senderId: userId,
      content: input.content,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
    },
  });

  return prisma.chatMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
}

export async function listPublicProjects(userId: string) {
  const publicProjects = await prisma.project.findMany({
    where: { 
      isPublic: true,
      ownerId: { not: userId },
      collaborators: { none: { userId } }
    },
    include: { owner: true },
    orderBy: { updatedAt: "desc" },
  });

  return publicProjects.map((p) => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    genre: p.genre,
    ownerName: p.owner.name,
    updatedAt: p.updatedAt.toISOString(),
    coverImageUrl: p.coverImageUrl,
    isPublic: true,
    role: "viewer"
  }));
}

export async function getChapterContent(projectId: string, userId: string, chapterId: string) {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Unauthorized");

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { content: true }
  });

  if (!chapter) throw new Error("Chapter not found");
  return chapter.content;
}

export async function reorderChapters(projectId: string, userId: string, orderedIds: string[]) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.chapter.update({ where: { id }, data: { index: index + 1 } })
    )
  );

  return getProject(projectId, userId);
}

export async function getChapterVersions(projectId: string, userId: string, chapterId: string) {
  const project = await getProject(projectId, userId);
  if (!project) throw new Error("Unauthorized");

  return prisma.chapterVersion.findMany({
    where: { projectId, chapterId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, content: true, createdBy: true, createdAt: true },
  });
}

export async function restoreVersion(projectId: string, userId: string, chapterId: string, versionId: string) {
  const project = await getProject(projectId, userId);
  if (!project || !project.viewerAccess.canEdit) throw new Error("Unauthorized");

  const version = await prisma.chapterVersion.findUnique({ where: { id: versionId } });
  if (!version || version.chapterId !== chapterId) throw new Error("Version not found");

  // Snapshot the current content first
  const current = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { content: true } });
  if (current?.content) {
    await prisma.chapterVersion.create({ data: { projectId, chapterId, content: current.content, createdBy: userId } });
  }

  await prisma.chapter.update({ where: { id: chapterId }, data: { content: version.content } });
  return version.content;
}
