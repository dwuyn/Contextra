import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/realtime", () => ({
  sendEvent: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  updateChapter: vi.fn(),
  listProjectAudience: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "./route";
import { getSession } from "@/lib/auth";
import { sendEvent } from "@/lib/realtime";
import { updateChapter, listProjectAudience } from "@/services/projectService";
import { revalidatePath } from "next/cache";

const PARAMS = Promise.resolve({
  projectId: "proj-001",
  chapterId: "chap-001",
});

describe("POST /api/projects/[projectId]/chapters/[chapterId]/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-001",
      email: "user@example.com",
      name: "User",
    });
    vi.mocked(listProjectAudience).mockResolvedValue(["user-002"]);
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title", content: "New Content" }),
    }), { params: PARAMS });

    expect(response.status).toBe(401);
  });

  it("saves with the normal keepalive payload and emits project_chapter_saved to collaborators", async () => {
    vi.mocked(updateChapter).mockResolvedValue({
      status: "saved",
      continuity: { fresh: true },
      contentChanged: true,
      updatedAt: "2026-06-25T10:00:00.000Z",
    });

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Title",
        content: "New Content",
        isCollaborative: true,
        expectedUpdatedAt: "2026-06-25T09:59:00.000Z",
      }),
    }), { params: PARAMS });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      result: {
        status: "saved",
        continuity: { fresh: true },
        contentChanged: true,
        updatedAt: "2026-06-25T10:00:00.000Z",
      },
    });
    expect(updateChapter).toHaveBeenCalledWith("proj-001", "user-001", "chap-001", {
      title: "New Title",
      content: "New Content",
      createVersion: false,
      expectedUpdatedAt: "2026-06-25T09:59:00.000Z",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/project/proj-001");
    expect(listProjectAudience).toHaveBeenCalledWith("proj-001", ["user-001"]);
    expect(sendEvent).toHaveBeenCalledWith(
      "user-002",
      "project_chapter_saved",
      expect.objectContaining({
        projectId: "proj-001",
        chapterId: "chap-001",
        title: "New Title",
        updatedAt: "2026-06-25T10:00:00.000Z",
        savedByUserId: "user-001",
        savedByName: "User",
      }),
    );
  });

  it("returns 409 on conflict and does not emit project_chapter_saved", async () => {
    vi.mocked(updateChapter).mockResolvedValue({
      status: "conflict",
      latest: {
        title: "Remote Title",
        summary: "",
        content: "<p>remote</p>",
        updatedAt: "2026-06-25T10:05:00.000Z",
      },
    });

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Title",
        content: "New Content",
        expectedUpdatedAt: "2026-06-25T10:00:00.000Z",
      }),
    }), { params: PARAMS });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: "conflict",
      latest: {
        title: "Remote Title",
        summary: "",
        content: "<p>remote</p>",
        updatedAt: "2026-06-25T10:05:00.000Z",
      },
    });
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when the normal save path fails", async () => {
    vi.mocked(updateChapter).mockRejectedValue(new Error("Database offline"));

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New Title",
        content: "New Content",
      }),
    }), { params: PARAMS });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Database offline");
  });
});
