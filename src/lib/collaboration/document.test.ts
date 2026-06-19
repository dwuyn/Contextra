import { describe, expect, it } from "vitest";
import {
  getChapterDocumentName,
  parseChapterDocumentName,
  shouldUseStoredChapterState,
} from "@/lib/collaboration/document";

describe("collaboration document naming", () => {
  it("builds and parses chapter document names", () => {
    const documentName = getChapterDocumentName("chapter-123");

    expect(documentName).toBe("chapter:chapter-123:body");
    expect(parseChapterDocumentName(documentName)).toEqual({
      chapterId: "chapter-123",
    });
  });

  it("rejects invalid document names", () => {
    expect(() => parseChapterDocumentName("project:chapter-123")).toThrow("Invalid collaboration document name");
  });

  it("reuses stored collaboration state only when it is at least as new as the chapter row", () => {
    const chapterUpdatedAt = "2026-06-13T01:00:00.000Z";

    expect(shouldUseStoredChapterState({
      chapterUpdatedAt,
      stateUpdatedAt: "2026-06-13T01:00:00.000Z",
    })).toBe(true);

    expect(shouldUseStoredChapterState({
      chapterUpdatedAt,
      stateUpdatedAt: "2026-06-13T01:05:00.000Z",
    })).toBe(true);

    expect(shouldUseStoredChapterState({
      chapterUpdatedAt,
      stateUpdatedAt: "2026-06-13T00:55:00.000Z",
    })).toBe(false);

    expect(shouldUseStoredChapterState({
      chapterUpdatedAt,
      stateUpdatedAt: null,
    })).toBe(false);
  });
});
