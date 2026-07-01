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
  isConfiguredVoice: vi.fn(),
  getTextToSpeechClient: vi.fn(),
  synthesizeWithSsml: vi.fn(),
  synthesizeWithText: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pronunciationEntry: {
      findMany: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { getSession } from "@/lib/auth";
import { requireProjectPermission } from "@/services/projectService";
import {
  isConfiguredVoice,
  getTextToSpeechClient,
  synthesizeWithSsml,
  synthesizeWithText,
} from "@/services/googleTtsService";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BODY = {
  projectId: "proj-001",
  language: "vi-VN",
  voiceId: "vi-VN-Neural2-A",
  rate: 1,
  text: "Xin chào",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/voice-reader/pronunciation-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEmptyRequest() {
  return new NextRequest("http://localhost/api/voice-reader/pronunciation-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// beforeEach — reset all mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: "user-001",
    email: "test@example.com",
  });
  (requireProjectPermission as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (isConfiguredVoice as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (getTextToSpeechClient as ReturnType<typeof vi.fn>).mockReturnValue({});
  (synthesizeWithText as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("audio"));
  (synthesizeWithSsml as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("audio"));
  (prisma.pronunciationEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Auth & permission
// ---------------------------------------------------------------------------

describe("POST /api/voice-reader/pronunciation-preview — auth", () => {
  it("returns 401 when session is missing", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 when permission check fails", async () => {
    (requireProjectPermission as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Forbidden"),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("POST /api/voice-reader/pronunciation-preview — validation", () => {
  it("returns 400 for empty body", async () => {
    const res = await POST(makeEmptyRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid language", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, language: "fr-FR" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid rate", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, rate: 999 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for text too long (301 chars)", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, text: "a".repeat(301) }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty text", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, text: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when voice is not configured", async () => {
    (isConfiguredVoice as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toContain("Voice not configured");
  });
});

// ---------------------------------------------------------------------------
// Successful synthesis
// ---------------------------------------------------------------------------

describe("POST /api/voice-reader/pronunciation-preview — success", () => {
  it("returns audio/mpeg with Cache-Control for valid vi-VN request", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns audio/mpeg for valid en-US request", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, language: "en-US" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("falls back to synthesizeWithText when synthesizeWithSsml throws", async () => {
    (synthesizeWithSsml as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("SSML failed"),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(synthesizeWithText).toHaveBeenCalled();
  });

  it("uses entryOverride instead of DB when provided", async () => {
    const body = {
      ...VALID_BODY,
      entryOverride: [
        {
          term: "VN",
          replacement: "Viet Nam",
          renderMode: "sub" as const,
          matchMode: "whole_word" as const,
          caseSensitive: false,
          priority: 5,
          enabled: true,
        },
      ],
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    // DB should NOT be queried when entryOverride is provided
    expect(prisma.pronunciationEntry.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TTS failure
// ---------------------------------------------------------------------------

describe("POST /api/voice-reader/pronunciation-preview — TTS failure", () => {
  it("returns 503 when both SSML and text synthesis fail", async () => {
    (synthesizeWithSsml as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("SSML failed"),
    );
    (synthesizeWithText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Text failed"),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    await expect(res.text()).resolves.toContain("TTS synthesis failed");
  });
});
