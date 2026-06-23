import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProject } from "./projectService";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    commentThread: {
      groupBy: vi.fn(),
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
});
