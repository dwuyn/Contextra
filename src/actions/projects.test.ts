import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  updateChapter: vi.fn(),
  getChapterCollaborationAccess: vi.fn(),
  requireProjectPermission: vi.fn(),
  getChapterVersionForRestore: vi.fn(),
  createChapterVersionSnapshot: vi.fn(),
}));

vi.mock("@/lib/collaboration/internal", () => ({
  exportCollaborativeChapter: vi.fn(),
  replaceCollaborativeChapter: vi.fn(),
  syncCollaborativeChapterDocument: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveCollaborativeChapter, restoreVersion, updateChapter } from "@/actions/projects";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";
import { exportCollaborativeChapter, replaceCollaborativeChapter, syncCollaborativeChapterDocument } from "@/lib/collaboration/internal";
import { revalidatePath } from "next/cache";

describe("projects.updateChapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
    });
    (projectService.updateChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
      continuity: { fresh: true },
      contentChanged: true,
    });
    (syncCollaborativeChapterDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      html: "<p>saved</p>",
    });
  });

  it("syncs the collaboration document after a local content save", async () => {
    const result = await updateChapter("project-1", "chapter-1", {
      title: "Chapter",
      content: "<p>saved</p>",
    });

    expect(projectService.updateChapter).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "chapter-1",
      expect.objectContaining({
        title: "Chapter",
        content: "<p>saved</p>",
      }),
    );
    expect(syncCollaborativeChapterDocument).toHaveBeenCalledWith({
      projectId: "project-1",
      chapterId: "chapter-1",
      html: "<p>saved</p>",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/project/project-1");
    expect(result).toEqual({
      continuity: { fresh: true },
      contentChanged: true,
    });
  });

  it("does not sync the collaboration document when the content did not change", async () => {
    (projectService.updateChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
      continuity: { fresh: true },
      contentChanged: false,
    });

    await updateChapter("project-1", "chapter-1", {
      title: "Retitled",
      content: "<p>unchanged</p>",
    });

    expect(syncCollaborativeChapterDocument).not.toHaveBeenCalled();
  });

  it("returns a warning instead of failing when collaboration sync lags behind", async () => {
    (syncCollaborativeChapterDocument as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Collab server offline"),
    );

    await expect(updateChapter("project-1", "chapter-1", {
      title: "Chapter",
      content: "<p>saved</p>",
    })).resolves.toEqual({
      continuity: { fresh: true },
      contentChanged: true,
      collaborationWarning: "Saved locally, but live collaboration may briefly lag until it resynchronizes.",
    });
  });
});

describe("projects.saveCollaborativeChapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
    });
    (projectService.getChapterCollaborationAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      viewerAccess: { canEdit: true },
      user: { id: "user-1", name: "Editor" },
    });
    (exportCollaborativeChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
      html: "<p>collaborative</p>",
      continuity: { fresh: true },
    });
    (projectService.updateChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
      continuity: { fresh: true },
      contentChanged: true,
    });
  });

  it("authorizes session edit access before calling internal export endpoint", async () => {
    await saveCollaborativeChapter("project-1", "chapter-1", {
      title: "Chapter Title",
      summary: "",
      createVersion: false,
    });

    expect(projectService.getChapterCollaborationAccess).toHaveBeenCalledWith("project-1", "user-1", "chapter-1");
    expect(exportCollaborativeChapter).toHaveBeenCalledWith({ projectId: "project-1", chapterId: "chapter-1" });
    expect(projectService.updateChapter).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "chapter-1",
      expect.objectContaining({ content: "<p>collaborative</p>" })
    );
  });

  it("throws an error if user does not have edit permission", async () => {
    (projectService.getChapterCollaborationAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      viewerAccess: { canEdit: false },
      user: { id: "user-1", name: "Editor" },
    });

    await expect(saveCollaborativeChapter("project-1", "chapter-1", {
      title: "Chapter Title",
      summary: "",
      createVersion: false,
    })).rejects.toThrow("Unauthorized");

    expect(exportCollaborativeChapter).not.toHaveBeenCalled();
  });

  it("uses provided content and skips internal export", async () => {
    await saveCollaborativeChapter("project-1", "chapter-1", {
      title: "Chapter Title",
      summary: "",
      content: "<p>provided content</p>",
      createVersion: false,
    });

    expect(projectService.getChapterCollaborationAccess).toHaveBeenCalledWith("project-1", "user-1", "chapter-1");
    expect(exportCollaborativeChapter).not.toHaveBeenCalled();
    expect(projectService.updateChapter).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "chapter-1",
      expect.objectContaining({ content: "<p>provided content</p>" })
    );
  });

  it("falls back to internal export when content is omitted", async () => {
    await saveCollaborativeChapter("project-1", "chapter-1", {
      title: "Chapter Title",
      summary: "",
      createVersion: false,
    });

    expect(exportCollaborativeChapter).toHaveBeenCalledWith({ projectId: "project-1", chapterId: "chapter-1" });
    expect(projectService.updateChapter).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "chapter-1",
      expect.objectContaining({ content: "<p>collaborative</p>" })
    );
  });
});

describe("projects.restoreVersion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
    });
    (projectService.getChapterVersionForRestore as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: "<p>restored version</p>",
    });
    (exportCollaborativeChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
      html: "<p>current live content</p>",
      continuity: { fresh: true },
    });
    (replaceCollaborativeChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
      html: "<p>restored version</p>",
      continuity: { fresh: true },
    });
  });

  it("calls export with projectId and calls replaceCollaborativeChapter with version content", async () => {
    const result = await restoreVersion("project-1", "chapter-1", "version-1");

    expect(projectService.requireProjectPermission).toHaveBeenCalledWith("project-1", "user-1", "edit");
    expect(exportCollaborativeChapter).toHaveBeenCalledWith({ projectId: "project-1", chapterId: "chapter-1" });
    expect(projectService.createChapterVersionSnapshot).toHaveBeenCalledWith("project-1", "chapter-1", "user-1", "<p>current live content</p>");
    expect(replaceCollaborativeChapter).toHaveBeenCalledWith({
      projectId: "project-1",
      chapterId: "chapter-1",
      html: "<p>restored version</p>",
    });
    expect(result).toEqual({
      content: "<p>restored version</p>",
      continuity: { fresh: true },
    });
  });
});
