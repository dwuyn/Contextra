import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  getChapterContent: vi.fn(),
}));

import { GET } from "./route";
import { getSession } from "@/lib/auth";
import { getChapterContent } from "@/services/projectService";

const PARAMS = Promise.resolve({
  projectId: "proj-001",
  chapterId: "chap-001",
});

describe("GET /api/projects/[projectId]/chapters/[chapterId]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-001",
      email: "user@example.com",
      name: "User",
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/projects/proj-001/chapters/chap-001/content"),
      { params: PARAMS },
    );

    expect(response.status).toBe(401);
  });

  it("returns the chapter content payload", async () => {
    vi.mocked(getChapterContent).mockResolvedValue({
      title: "Chapter One",
      content: "<p>Hello</p>",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    const response = await GET(
      new Request("http://localhost/api/projects/proj-001/chapters/chap-001/content"),
      { params: PARAMS },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: "Chapter One",
      content: "<p>Hello</p>",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });
    expect(getChapterContent).toHaveBeenCalledWith("proj-001", "user-001", "chap-001");
  });

  it("returns 500 when chapter loading fails", async () => {
    vi.mocked(getChapterContent).mockRejectedValue(new Error("Chapter not found"));

    const response = await GET(
      new Request("http://localhost/api/projects/proj-001/chapters/chap-001/content"),
      { params: PARAMS },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Chapter not found");
  });
});
