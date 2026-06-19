import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  getChapterIllustration: vi.fn(),
  generateChapterIllustration: vi.fn(),
}));

import { GET, POST } from "./route";
import { getSession } from "@/lib/auth";
import { generateChapterIllustration, getChapterIllustration } from "@/services/projectService";

const PARAMS = Promise.resolve({
  projectId: "proj-001",
  chapterId: "chap-001",
});

beforeEach(() => {
  vi.clearAllMocks();
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: "user-001",
    email: "user@example.com",
    name: "User",
  });
});

describe("GET /api/projects/[projectId]/chapters/[chapterId]/illustration", () => {
  it("returns 401 when the user is not authenticated", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration"), {
      params: PARAMS,
    });

    expect(response.status).toBe(401);
  });

  it("streams the stored illustration when access is allowed", async () => {
    (getChapterIllustration as ReturnType<typeof vi.fn>).mockResolvedValue({
      buffer: Buffer.from("image-bytes"),
      contentType: "image/png",
      illustration: {
        url: "/api/projects/proj-001/chapters/chap-001/illustration?v=1",
        prompt: "storm-lit harbor at dusk",
        model: "imagen-4.0-generate-001",
        generatedAt: "2026-06-07T00:00:00.000Z",
      },
    });

    const response = await GET(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration"), {
      params: PARAMS,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    await expect(response.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it("returns 404 when the illustration is missing", async () => {
    (getChapterIllustration as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Illustration not found"));

    const response = await GET(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration"), {
      params: PARAMS,
    });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/projects/[projectId]/chapters/[chapterId]/illustration", () => {
  it("returns 401 when the user is not authenticated", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), { params: PARAMS });

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payloads", async () => {
    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterTitle: "", chapterContent: "" }),
    }), { params: PARAMS });

    expect(response.status).toBe(400);
    expect(generateChapterIllustration).not.toHaveBeenCalled();
  });

  it("returns the updated illustration metadata on success", async () => {
    (generateChapterIllustration as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "/api/projects/proj-001/chapters/chap-001/illustration?v=2",
      prompt: "rain-soaked fantasy harbor",
      model: "imagen-4.0-generate-001",
      generatedAt: "2026-06-07T01:00:00.000Z",
    });

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterTitle: "Chapter 7",
        chapterContent: "<p>Storms over the harbor.</p>",
        customInstruction: "oil painting",
      }),
    }), { params: PARAMS });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      illustration: {
        url: "/api/projects/proj-001/chapters/chap-001/illustration?v=2",
        prompt: "rain-soaked fantasy harbor",
        model: "imagen-4.0-generate-001",
        generatedAt: "2026-06-07T01:00:00.000Z",
      },
    });
    expect(generateChapterIllustration).toHaveBeenCalledWith(
      "proj-001",
      "user-001",
      "chap-001",
      {
        chapterTitle: "Chapter 7",
        chapterContent: "<p>Storms over the harbor.</p>",
        customInstruction: "oil painting",
      },
    );
  });

  it("returns 400 when generation preconditions fail", async () => {
    (generateChapterIllustration as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Add some chapter content before generating an illustration."),
    );

    const response = await POST(new Request("http://localhost/api/projects/proj-001/chapters/chap-001/illustration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterTitle: "Chapter 7",
        chapterContent: "<p></p>",
      }),
    }), { params: PARAMS });

    expect(response.status).toBe(400);
  });
});
