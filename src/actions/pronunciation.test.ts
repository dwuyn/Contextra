import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/projectService", () => ({
  requireProjectPermission: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pronunciationEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    character: { findMany: vi.fn() },
    canonEntity: { findMany: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  listPronunciationEntries,
  createPronunciationEntry,
  updatePronunciationEntry,
  deletePronunciationEntry,
  togglePronunciationEntry,
  importPronunciationSuggestions,
} from "@/actions/pronunciation";
import { getSession } from "@/lib/auth";
import { requireProjectPermission } from "@/services/projectService";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "user-001";
const ENTRY_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const VALID_CREATE_INPUT = {
  projectId: PROJECT_ID,
  language: "vi-VN" as const,
  term: "TP.HCM",
  replacement: "thành phố Hồ Chí Minh",
  renderMode: "sub" as const,
  matchMode: "whole_word" as const,
  caseSensitive: false,
  priority: 5,
  notes: "City abbreviation",
};

const VALID_UPDATE_INPUT = {
  id: ENTRY_ID,
  term: "Updated Term",
};

function mockSession() {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: USER_ID,
    email: "test@example.com",
  });
}

function mockNoSession() {
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

function mockPermission() {
  (requireProjectPermission as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
}

function mockPermissionDenied() {
  (requireProjectPermission as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("Forbidden"),
  );
}

// ---------------------------------------------------------------------------
// beforeEach — reset all mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockSession();
  mockPermission();
  (prisma.pronunciationEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.pronunciationEntry.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: ENTRY_ID,
    ...VALID_CREATE_INPUT,
    source: "manual",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (prisma.pronunciationEntry.update as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: ENTRY_ID,
    ...VALID_CREATE_INPUT,
    source: "manual",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (prisma.pronunciationEntry.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: ENTRY_ID,
  });
  (prisma.pronunciationEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    projectId: PROJECT_ID,
  });
  (prisma.character.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.canonEntity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// listPronunciationEntries
// ---------------------------------------------------------------------------

describe("listPronunciationEntries", () => {
  it("throws Unauthorized when session is missing", async () => {
    mockNoSession();
    await expect(listPronunciationEntries(PROJECT_ID, "vi-VN")).rejects.toThrow("Unauthorized");
  });

  it("propagates error when permission check fails", async () => {
    mockPermissionDenied();
    await expect(listPronunciationEntries(PROJECT_ID, "vi-VN")).rejects.toThrow("Forbidden");
  });

  it("returns entries ordered by priority desc, term asc", async () => {
    const entries = [
      { id: "1", term: "VN", priority: 10 },
      { id: "2", term: "AI", priority: 5 },
    ];
    (prisma.pronunciationEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    const result = await listPronunciationEntries(PROJECT_ID, "vi-VN");
    expect(result).toEqual(entries);
    expect(prisma.pronunciationEntry.findMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, language: "vi-VN" },
      orderBy: [{ priority: "desc" }, { term: "asc" }],
      select: expect.objectContaining({
        id: true,
        term: true,
        replacement: true,
        renderMode: true,
        matchMode: true,
        caseSensitive: true,
        priority: true,
        enabled: true,
        source: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// createPronunciationEntry
// ---------------------------------------------------------------------------

describe("createPronunciationEntry", () => {
  it("throws Unauthorized when session is missing", async () => {
    mockNoSession();
    await expect(createPronunciationEntry(VALID_CREATE_INPUT)).rejects.toThrow("Unauthorized");
  });

  it("throws when user lacks edit permission", async () => {
    mockPermissionDenied();
    await expect(createPronunciationEntry(VALID_CREATE_INPUT)).rejects.toThrow("Forbidden");
  });

  it("creates entry with source 'manual' on success", async () => {
    const result = await createPronunciationEntry(VALID_CREATE_INPUT);
    expect(result.source).toBe("manual");
    expect(prisma.pronunciationEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: PROJECT_ID,
        language: "vi-VN",
        term: "TP.HCM",
        replacement: "thành phố Hồ Chí Minh",
        renderMode: "sub",
        matchMode: "whole_word",
        caseSensitive: false,
        priority: 5,
        source: "manual",
        notes: "City abbreviation",
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("throws descriptive error on duplicate constraint", async () => {
    (prisma.pronunciationEntry.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Unique constraint failed on the fields"),
    );
    await expect(createPronunciationEntry(VALID_CREATE_INPUT)).rejects.toThrow(
      'A pronunciation entry already exists for term "TP.HCM" with match mode "whole_word"',
    );
  });
});

// ---------------------------------------------------------------------------
// updatePronunciationEntry
// ---------------------------------------------------------------------------

describe("updatePronunciationEntry", () => {
  it("throws 'Pronunciation entry not found' when entry does not exist", async () => {
    (prisma.pronunciationEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(updatePronunciationEntry(VALID_UPDATE_INPUT)).rejects.toThrow(
      "Pronunciation entry not found",
    );
  });

  it("updates only provided fields on success", async () => {
    const result = await updatePronunciationEntry(VALID_UPDATE_INPUT);
    expect(result).toBeDefined();
    expect(prisma.pronunciationEntry.update).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
      data: expect.objectContaining({
        term: "Updated Term",
      }),
    });
    // Fields not provided should NOT be in the data
    const callData = (prisma.pronunciationEntry.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(callData.replacement).toBeUndefined();
    expect(callData.renderMode).toBeUndefined();
    expect(callData.priority).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------
// deletePronunciationEntry
// ---------------------------------------------------------------------------

describe("deletePronunciationEntry", () => {
  it("throws when entry belongs to a different project", async () => {
    (prisma.pronunciationEntry.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      projectId: "other-project",
    });
    await expect(deletePronunciationEntry(ENTRY_ID, PROJECT_ID)).rejects.toThrow(
      "Pronunciation entry does not belong to this project",
    );
  });

  it("deletes entry on success", async () => {
    await deletePronunciationEntry(ENTRY_ID, PROJECT_ID);
    expect(prisma.pronunciationEntry.delete).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------
// togglePronunciationEntry
// ---------------------------------------------------------------------------

describe("togglePronunciationEntry", () => {
  it("toggles enabled field on success", async () => {
    const result = await togglePronunciationEntry(ENTRY_ID, PROJECT_ID, false);
    expect(result).toBeDefined();
    expect(prisma.pronunciationEntry.update).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
      data: { enabled: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------
// importPronunciationSuggestions
// ---------------------------------------------------------------------------

describe("importPronunciationSuggestions", () => {
  it("imports from characters, canon entities, and aliases; returns count; entries are disabled", async () => {
    (prisma.character.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: "Lan" },
      { name: "Hùng" },
    ]);
    (prisma.canonEntity.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ name: "Hà Nội" }]) // first call: names
      .mockResolvedValueOnce([{ aliases: ["Thăng Long", "Hà Thành"] }]); // second call: aliases

    const result = await importPronunciationSuggestions(PROJECT_ID, "vi-VN");

    expect(result.importedCount).toBe(5); // 2 characters + 1 canon entity + 2 aliases

    // All created entries should have enabled: false
    const createCalls = (prisma.pronunciationEntry.create as ReturnType<typeof vi.fn>).mock.calls;
    for (const call of createCalls) {
      expect(call[0].data.enabled).toBe(false);
    }

    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("skips existing terms to avoid duplicates", async () => {
    (prisma.pronunciationEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { term: "Lan", matchMode: "whole_word" },
    ]);
    (prisma.character.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: "Lan" }, // already exists
      { name: "Hùng" }, // new
    ]);
    (prisma.canonEntity.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await importPronunciationSuggestions(PROJECT_ID, "vi-VN");
    expect(result.importedCount).toBe(1); // only Hùng
  });
});
