import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  requireProjectPermission: vi.fn(),
}));

vi.mock("@/services/googleTtsService", () => ({
  listAvailableVoices: vi.fn(),
}));

import { GET } from "./route";
import { getSession } from "@/lib/auth";
import { requireProjectPermission } from "@/services/projectService";
import { listAvailableVoices } from "@/services/googleTtsService";

function makeRequest(projectId: string | null, lang: string | null) {
  const url = new URL("http://localhost/api/voice-reader/voices");
  if (projectId) url.searchParams.set("projectId", projectId);
  if (lang) url.searchParams.set("lang", lang);
  return new NextRequest(url);
}

describe("GET /api/voice-reader/voices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthorized", async () => {
    (getSession as any).mockResolvedValue(null);
    const req = makeRequest("proj-1", "en-US");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when missing query parameters", async () => {
    (getSession as any).mockResolvedValue({ userId: "user-1" });
    const req = makeRequest(null, null);
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with voices list on success", async () => {
    (getSession as any).mockResolvedValue({ userId: "user-1" });
    (requireProjectPermission as any).mockResolvedValue(undefined);
    const mockVoices = [{ id: "en-US-Neural2-F", label: "Neural2 F", language: "en-US" }];
    (listAvailableVoices as any).mockResolvedValue(mockVoices);

    const req = makeRequest("proj-1", "en-US");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.voices).toEqual(mockVoices);
    expect(requireProjectPermission).toHaveBeenCalledWith("proj-1", "user-1", "view");
    expect(listAvailableVoices).toHaveBeenCalledWith("en-US");
  });

  it("returns 503 when listAvailableVoices throws error", async () => {
    (getSession as any).mockResolvedValue({ userId: "user-1" });
    (requireProjectPermission as any).mockResolvedValue(undefined);
    (listAvailableVoices as any).mockRejectedValue(new Error("Google API error"));

    const req = makeRequest("proj-1", "en-US");
    const res = await GET(req);

    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toBe("Google API error");
  });
});
