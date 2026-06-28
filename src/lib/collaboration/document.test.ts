import { describe, expect, it } from "vitest";
import {
  getChapterDocumentName,
  isAuthorizedDocument,
  parseChapterDocumentName,
  shouldUseStoredChapterState,
  encodeChapterState,
  isEncodedChapterStateBlank,
  getChapterHtmlFromEncodedState,
  createChapterYDocFromHtml,
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

  it("authorizes correct document names and rejects mismatches", () => {
    expect(isAuthorizedDocument("chapter:chapter-123:body", "chapter-123")).toBe(true);
    expect(isAuthorizedDocument("chapter:chapter-456:body", "chapter-123")).toBe(false);
    expect(isAuthorizedDocument("chapter:chapter-123:body-alt", "chapter-123")).toBe(false);
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

describe("encoded state blank detection", () => {
  it("detects blank encoded state as blank", () => {
    const doc = createChapterYDocFromHtml("<p></p>");
    const encoded = encodeChapterState(doc);
    expect(isEncodedChapterStateBlank(encoded)).toBe(true);
  });

  it("detects meaningful encoded state as not blank", () => {
    const doc = createChapterYDocFromHtml("<p>Hello world</p>");
    const encoded = encodeChapterState(doc);
    expect(isEncodedChapterStateBlank(encoded)).toBe(false);
  });

  it("round-trips HTML through encode and decode correctly", () => {
    const doc = createChapterYDocFromHtml("<p>Test content</p>");
    const encoded = encodeChapterState(doc);
    const decodedHtml = getChapterHtmlFromEncodedState(encoded);
    expect(decodedHtml).toBe("<p>Test content</p>");
  });
});
