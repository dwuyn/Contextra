import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  updateChapter: vi.fn(),
  restoreVersion: vi.fn(),
  listProjectAudience: vi.fn(),
  getChapterCollaborationAccess: vi.fn(),
}));

vi.mock("@/lib/collaboration/internal", () => ({
  exportCollaborativeChapter: vi.fn(),
  replaceCollaborativeChapter: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chapter: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/realtime", () => ({
  sendEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveCollaborativeChapter, restoreVersion, updateChapter } from "@/actions/projects";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEvent } from "@/lib/realtime";
import * as projectService from "@/services/projectService";
import { exportCollaborativeChapter } from "@/lib/collaboration/internal";
import { revalidatePath } from "next/cache";

describe("projects.updateChapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      name: "Editor One",
    });
    vi.mocked(projectService.updateChapter).mockResolvedValue({
      status: "saved",
      continuity: { fresh: true },
      contentChanged: true,
      updatedAt: "2026-06-25T10:00:00.000Z",
    });
    vi.mocked(projectService.listProjectAudience).mockResolvedValue(["user-2"]);
    vi.mocked(prisma.chapter.findFirst).mockResolvedValue({
      title: "Chapter Title",
      updatedAt: new Date("2026-06-25T10:00:00.000Z"),
    } as never);
  });

  it("saves through the normal chapter update path and emits project_chapter_saved", async () => {
    const result = await updateChapter("project-1", "chapter-1", {
      title: "Chapter Title",
      content: "<p>saved</p>",
      expectedUpdatedAt: "2026-06-25T09:55:00.000Z",
    });

    expect(projectService.updateChapter).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "chapter-1",
      {
        title: "Chapter Title",
        content: "<p>saved</p>",
        expectedUpdatedAt: "2026-06-25T09:55:00.000Z",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/project/project-1");
    expect(projectService.listProjectAudience).toHaveBeenCalledWith("project-1", ["user-1"]);
    expect(prisma.chapter.findFirst).toHaveBeenCalledWith({
      where: { id: "chapter-1", projectId: "project-1" },
      select: { title: true, updatedAt: true },
    });
    expect(sendEvent).toHaveBeenCalledWith(
      "user-2",
      "project_chapter_saved",
      expect.objectContaining({
        projectId: "project-1",
        chapterId: "chapter-1",
        title: "Chapter Title",
        updatedAt: "2026-06-25T10:00:00.000Z",
        savedByUserId: "user-1",
        savedByName: "Editor One",
      }),
    );
    expect(result).toEqual({
      status: "saved",
      continuity: { fresh: true },
      contentChanged: true,
      updatedAt: "2026-06-25T10:00:00.000Z",
    });
  });

  it("returns the conflict payload unchanged and skips fan-out", async () => {
    vi.mocked(projectService.updateChapter).mockResolvedValue({
      status: "conflict",
      latest: {
        title: "Remote Title",
        summary: "",
        content: "<p>remote</p>",
        updatedAt: "2026-06-25T10:05:00.000Z",
      },
    });

    const result = await updateChapter("project-1", "chapter-1", {
      title: "Local Title",
      content: "<p>local</p>",
      expectedUpdatedAt: "2026-06-25T10:00:00.000Z",
    });

    expect(result).toEqual({
      status: "conflict",
      latest: {
        title: "Remote Title",
        summary: "",
        content: "<p>remote</p>",
        updatedAt: "2026-06-25T10:05:00.000Z",
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(projectService.listProjectAudience).not.toHaveBeenCalled();
    expect(prisma.chapter.findFirst).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });
});

describe("projects.saveCollaborativeChapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      name: "Editor One",
    });
    vi.mocked(projectService.getChapterCollaborationAccess).mockResolvedValue({
      viewerAccess: {
        canView: true,
        canEdit: true,
        canManage: false,
        isPublicViewer: false,
        permissionLevel: 1,
        role: "editor",
      },
      user: {
        id: "user-1",
        name: "Editor One",
        email: "user@example.com",
        profileImageUrl: null,
      },
    });
    vi.mocked(projectService.updateChapter).mockResolvedValue({
      status: "saved",
      continuity: { fresh: true },
      contentChanged: true,
      updatedAt: "2026-06-25T10:00:00.000Z",
    });
    vi.mocked(projectService.listProjectAudience).mockResolvedValue([]);
    vi.mocked(prisma.chapter.findFirst).mockResolvedValue({
      title: "Chapter Title",
      updatedAt: new Date("2026-06-25T10:00:00.000Z"),
    } as never);
    vi.mocked(exportCollaborativeChapter).mockResolvedValue({
      html: "<p>collaborative</p>",
      continuity: { fresh: true },
    });
  });

  it("uses provided content and skips internal export", async () => {
    await saveCollaborativeChapter("project-1", "chapter-1", {
      title: "Chapter Title",
      content: "<p>provided content</p>",
      createVersion: false,
    });

    expect(exportCollaborativeChapter).not.toHaveBeenCalled();
    expect(projectService.updateChapter).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "chapter-1",
      expect.objectContaining({ content: "<p>provided content</p>" }),
    );
  });
});

describe("projects.restoreVersion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      name: "Editor One",
    });
    vi.mocked(projectService.listProjectAudience).mockResolvedValue([]);
    vi.mocked(prisma.chapter.findFirst).mockResolvedValue({
      title: "Chapter Title",
      updatedAt: new Date("2026-06-25T10:00:00.000Z"),
    } as never);
    vi.mocked(projectService.restoreVersion).mockResolvedValue({
      content: "<p>restored version</p>",
      continuity: { fresh: true },
    });
  });

  it("calls projectService.restoreVersion and returns the result", async () => {
    const result = await restoreVersion("project-1", "chapter-1", "version-1");

    expect(projectService.restoreVersion).toHaveBeenCalledWith("project-1", "user-1", "chapter-1", "version-1");
    expect(result).toEqual({
      content: "<p>restored version</p>",
      continuity: { fresh: true },
    });
  });
});
