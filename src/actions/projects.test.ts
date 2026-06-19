import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  updateChapter: vi.fn(),
}));

vi.mock("@/lib/collaboration/internal", () => ({
  exportCollaborativeChapter: vi.fn(),
  replaceCollaborativeChapter: vi.fn(),
  syncCollaborativeChapterDocument: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updateChapter } from "@/actions/projects";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";
import { syncCollaborativeChapterDocument } from "@/lib/collaboration/internal";
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
