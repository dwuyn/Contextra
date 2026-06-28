import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChapter, getProject, upsertProjectPresence, leaveProjectPresence, syncChaptersWithOutline } from "./projectService";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    project: {
      findUnique: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    commentThread: {
      groupBy: vi.fn(),
    },
    projectPresence: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    chapter: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("projectService.getProject DTO splits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockAccessSnapshot = {
    ownerId: "owner-1",
    isPublic: true,
    collaborators: [
      { userId: "owner-1", role: "owner", permissionLevel: 3 },
      { userId: "collaborator-1", role: "editor", permissionLevel: 2 },
    ],
    branches: [
      { id: "branch-main", name: "Main" },
      { id: "branch-other", name: "Other" },
    ],
  };

  const mockFullProject = {
    id: "project-1",
    ownerId: "owner-1",
    name: "Test Project",
    mode: "personal",
    genre: "fantasy",
    summary: "A test fantasy story",
    isPublic: true,
    coverImageUrl: null,
    tone: "dark",
    audience: "mature",
    sharedNotes: "notes here",
    worldRules: [],
    outline: { acts: [] },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    collaborators: [
      {
        id: "c-1",
        projectId: "project-1",
        userId: "owner-1",
        role: "owner",
        permissionLevel: 3,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        user: { id: "owner-1", name: "Owner", email: "owner@example.com", profileImageUrl: null },
      },
      {
        id: "c-2",
        projectId: "project-1",
        userId: "collaborator-1",
        role: "editor",
        permissionLevel: 2,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        user: { id: "collaborator-1", name: "Collaborator", email: "collab@example.com", profileImageUrl: null },
      },
    ],
    chapters: [],
    branches: [
      { id: "branch-main", projectId: "project-1", name: "Main", description: "", status: "active", highlights: [] },
    ],
    canonProposals: [],
    storyArcs: [],
    outlineBeats: [],
    usage: [{ id: "u-1", tokens: 100, costUsd: 0.01, model: "gemini", actor: "owner@example.com", createdAt: new Date() }],
    versions: [],
    chatMessages: [],
    invites: [],
    presence: [],
    aiMessages: [],
  };

  it("returns stripped DTO for public-viewer", async () => {
    // 1. Mock accessSnapshot
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockAccessSnapshot);
    // 2. Mock public view query
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFullProject);
    // 3. Mock currentUser query
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "unrelated-user",
      name: "Unrelated User",
      profileImageUrl: null,
    });

    const result = await getProject("project-1", "unrelated-user");
    expect(result).not.toBeNull();
    expect(result!.viewerAccess.isPublicViewer).toBe(true);
    expect(result!.pendingInvites).toEqual([]);
    expect(result!.usage).toEqual([]);
    expect(result!.aiMessages).toEqual([]);
    expect(result!.chatMessages).toEqual([]);
    // Collaborator emails must be stripped
    expect(result!.collaborators[0].user.email).toBeUndefined();
    expect(result!.collaborators[1].user.email).toBeUndefined();
  });

  it("returns full DTO with emails and chat for managers", async () => {
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockAccessSnapshot);
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFullProject);
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "owner-1",
      name: "Owner",
      email: "owner@example.com",
    });
    (prisma.commentThread.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await getProject("project-1", "owner-1");
    expect(result).not.toBeNull();
    expect(result!.viewerAccess.isPublicViewer).toBe(false);
    expect(result!.viewerAccess.canManage).toBe(true);
    expect(result!.usage).toHaveLength(1);
    expect(result!.collaborators[0].user.email).toBe("owner@example.com");
  });

  it("returns collaborator DTO for non-manager collaborators (strips usage & invites)", async () => {
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockAccessSnapshot);
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFullProject);
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "collaborator-1",
      name: "Collaborator",
      email: "collab@example.com",
    });
    (prisma.commentThread.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await getProject("project-1", "collaborator-1");
    expect(result).not.toBeNull();
    expect(result!.viewerAccess.isPublicViewer).toBe(false);
    expect(result!.viewerAccess.canManage).toBe(false);
    // Standard collaborator gets collaborator emails but strips invites & usage logs
    expect(result!.collaborators[0].user.email).toBe("owner@example.com");
    expect(result!.pendingInvites).toEqual([]);
    expect(result!.usage).toEqual([]);
  });

  it("locks the branch row before allocating the next chapter index", async () => {
    const createdChapter = {
      id: "chapter-3",
      projectId: "project-1",
      branchId: "branch-main",
      title: "Chapter 3",
      summary: "",
      content: "",
      index: 3,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "branch-main" }]),
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ index: 2 }),
        create: vi.fn().mockResolvedValue(createdChapter),
      },
      project: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    (prisma.project.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockAccessSnapshot)
      .mockResolvedValueOnce(mockAccessSnapshot)
      .mockResolvedValueOnce(mockFullProject);
    (prisma.branch.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "branch-main" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "owner-1",
      name: "Owner",
      email: "owner@example.com",
    });
    (prisma.commentThread.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (callback: (args: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await createChapter("project-1", "owner-1", {
      branchId: "branch-main",
      title: "Chapter 3",
      summary: "",
      content: "",
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.chapter.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        branchId: "branch-main",
      },
      orderBy: {
        index: "desc",
      },
      select: {
        index: true,
      },
    });
    expect(tx.chapter.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        branchId: "branch-main",
        title: "Chapter 3",
        summary: "",
        content: "",
        index: 3,
      },
    });
    expect(result.chapter.id).toBe("chapter-3");
    expect(result.continuity).toEqual({ fresh: true });
  });
});

describe("projectService presence persistence", () => {
  const mockPresence = {
    id: "presence-1",
    projectId: "project-1",
    userId: "user-1",
    chapterId: "chapter-1",
    state: "viewing",
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: "user-1", name: "Test", email: "test@test.com", profileImageUrl: null },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "project-1",
      ownerId: "user-1",
      isPublic: true,
      collaborators: [{ userId: "user-1", role: "owner", permissionLevel: 3 }],
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1" } as any);
    vi.mocked(prisma.commentThread.groupBy).mockResolvedValue([]);
  });

  it("upsert updates existing presence via updateMany then findUniqueOrThrow", async () => {
    vi.mocked(prisma.projectPresence.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.projectPresence.findUniqueOrThrow).mockResolvedValue(mockPresence);

    const result = await upsertProjectPresence("project-1", "user-1", { state: "viewing" });

    expect(prisma.projectPresence.updateMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", userId: "user-1" },
      data: expect.objectContaining({ state: "viewing" }),
    });
    expect(prisma.projectPresence.create).not.toHaveBeenCalled();
    expect(result.id).toBe("presence-1");
  });

  it("upsert creates new presence when updateMany returns zero rows", async () => {
    vi.mocked(prisma.projectPresence.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.projectPresence.create).mockResolvedValue(mockPresence);

    const result = await upsertProjectPresence("project-1", "user-1", { state: "editing" });

    expect(prisma.projectPresence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ state: "editing", projectId: "project-1", userId: "user-1" }),
      include: { user: { select: expect.any(Object) } },
    });
    expect(result.id).toBe("presence-1");
  });

  it("upsert falls back to update after create loses unique-key race", async () => {
    vi.mocked(prisma.projectPresence.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.projectPresence.create).mockRejectedValue(new Error("Unique constraint"));
    vi.mocked(prisma.projectPresence.update).mockResolvedValue(mockPresence);

    const result = await upsertProjectPresence("project-1", "user-1", { state: "viewing" });

    expect(prisma.projectPresence.update).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: "project-1", userId: "user-1" } },
      data: expect.objectContaining({ state: "viewing" }),
      include: { user: { select: expect.any(Object) } },
    });
    expect(result.id).toBe("presence-1");
  });

  it("upsert forces non-editors to viewing state", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "project-1",
      ownerId: "owner-1",
      isPublic: true,
      collaborators: [{ userId: "user-2", role: "viewer", permissionLevel: 1 }],
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-2" } as any);
    vi.mocked(prisma.projectPresence.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.projectPresence.findUniqueOrThrow).mockResolvedValue(mockPresence);

    await upsertProjectPresence("project-1", "user-2", { state: "editing" });

    expect(prisma.projectPresence.updateMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", userId: "user-2" },
      data: expect.objectContaining({ state: "viewing" }),
    });
  });

  it("leave deletes presence rows for the user+project pair", async () => {
    vi.mocked(prisma.projectPresence.deleteMany).mockResolvedValue({ count: 1 });

    const result = await leaveProjectPresence("project-1", "user-1");

    expect(prisma.projectPresence.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", userId: "user-1" },
    });
    expect(result).toEqual({ projectId: "project-1", userId: "user-1" });
  });
});

describe("projectService.syncChaptersWithOutline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockOutline = {
    acts: [
      {
        id: "act-1",
        title: "Act One",
        summary: "First act",
        chapters: [
          { id: "ch-1", title: "Chapter One", summary: "Intro" },
          { id: "ch-2", title: "Chapter Two", summary: "Rising action" },
          { id: "ch-3", title: "Chapter Three", summary: "Climax" },
        ],
      },
    ],
  };

  it("creates chapters for new outline items", async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: "branch-1" },
    ] as any);
    vi.mocked(prisma.chapter.findMany).mockResolvedValue([]);

    vi.mocked(prisma.chapter.create).mockResolvedValue({} as any);

    await syncChaptersWithOutline("project-1", mockOutline);

    expect(prisma.chapter.create).toHaveBeenCalledTimes(3);
    expect(prisma.chapter.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        branchId: "branch-1",
        title: "Chapter One",
        summary: "",
        content: "",
        index: 1,
      },
    });
    expect(prisma.chapter.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        branchId: "branch-1",
        title: "Chapter Two",
        summary: "",
        content: "",
        index: 2,
      },
    });
    expect(prisma.chapter.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        branchId: "branch-1",
        title: "Chapter Three",
        summary: "",
        content: "",
        index: 3,
      },
    });
  });

  it("updates chapter titles when they differ", async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: "branch-1" },
    ] as any);
    vi.mocked(prisma.chapter.findMany).mockResolvedValue([
      { id: "existing-1", index: 1, title: "Old Title" },
      { id: "existing-2", index: 2, title: "Chapter Two" },
      { id: "existing-3", index: 3, title: "Old Title 3" },
    ] as any);

    vi.mocked(prisma.chapter.update).mockResolvedValue({} as any);

    await syncChaptersWithOutline("project-1", mockOutline);

    expect(prisma.chapter.update).toHaveBeenCalledTimes(2);
    expect(prisma.chapter.update).toHaveBeenCalledWith({
      where: { id: "existing-1" },
      data: { title: "Chapter One" },
    });
    expect(prisma.chapter.update).toHaveBeenCalledWith({
      where: { id: "existing-3" },
      data: { title: "Chapter Three" },
    });
    expect(prisma.chapter.create).not.toHaveBeenCalled();
  });

  it("does not update chapters when titles match", async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: "branch-1" },
    ] as any);
    vi.mocked(prisma.chapter.findMany).mockResolvedValue([
      { id: "existing-1", index: 1, title: "Chapter One" },
      { id: "existing-2", index: 2, title: "Chapter Two" },
      { id: "existing-3", index: 3, title: "Chapter Three" },
    ] as any);

    await syncChaptersWithOutline("project-1", mockOutline);

    expect(prisma.chapter.update).not.toHaveBeenCalled();
    expect(prisma.chapter.create).not.toHaveBeenCalled();
  });

  it("only syncs active branches, ignores merged branches", async () => {
    const outline = {
      acts: [
        {
          id: "act-1",
          title: "Act",
          summary: "",
          chapters: [{ id: "ch-1", title: "Chapter One", summary: "" }],
        },
      ],
    };

    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: "branch-active" },
    ] as any);

    vi.mocked(prisma.chapter.findMany).mockResolvedValue([]);
    vi.mocked(prisma.chapter.create).mockResolvedValue({} as any);

    await syncChaptersWithOutline("project-1", outline);

    expect(prisma.branch.findMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", status: "active" },
      select: { id: true },
    });
    expect(prisma.chapter.create).toHaveBeenCalledTimes(1);
  });

  it("handles empty outline gracefully", async () => {
    const emptyOutline = { acts: [] };

    await syncChaptersWithOutline("project-1", emptyOutline);

    expect(prisma.branch.findMany).not.toHaveBeenCalled();
    expect(prisma.chapter.findMany).not.toHaveBeenCalled();
    expect(prisma.chapter.create).not.toHaveBeenCalled();
  });

  it("syncs all active branches", async () => {
    vi.mocked(prisma.branch.findMany).mockResolvedValue([
      { id: "branch-1" },
      { id: "branch-2" },
    ] as any);
    vi.mocked(prisma.chapter.findMany).mockResolvedValue([]);
    vi.mocked(prisma.chapter.create).mockResolvedValue({} as any);

    await syncChaptersWithOutline("project-1", mockOutline);

    expect(prisma.chapter.create).toHaveBeenCalledTimes(6);
    expect(prisma.chapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: "branch-1" }),
      }),
    );
    expect(prisma.chapter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: "branch-2" }),
      }),
    );
  });

  it("uses txClient when provided instead of prisma", async () => {
    const tx = {
      branch: { findMany: vi.fn().mockResolvedValue([{ id: "branch-1" }]) },
      chapter: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    await syncChaptersWithOutline("project-1", mockOutline, tx as any);

    expect(tx.branch.findMany).toHaveBeenCalled();
    expect(tx.chapter.findMany).toHaveBeenCalled();
    expect(tx.chapter.create).toHaveBeenCalledTimes(3);
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });
});
