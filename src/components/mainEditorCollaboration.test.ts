import { describe, expect, it } from "vitest";
import {
  canFinalizeLiveCollaborationSync,
  executeLiveSnapshot,
  getPreservedEditorContent,
  getPreferredDraftContent,
  getEditorTransportKey,
  isMeaningfulEditorContent,
  resolveLiveCollaborationChapterId,
  shouldApplyLocalEditorContent,
  shouldFlushLiveCollaborativeContent,
  shouldPreservePreviousEditorContent,
  shouldPublishSavedTitle,
  shouldScheduleReconnect,
} from "@/components/mainEditorCollaboration";

describe("mainEditorCollaboration", () => {
  it("latches live collaboration for the selected chapter once activated", () => {
    expect(resolveLiveCollaborationChapterId({
      selectedChapterId: "chapter-1",
      previousLiveChapterId: "chapter-1",
      isLiveCollaborationRequested: false,
      collaborationDisabledChapterId: null,
    })).toBe("chapter-1");
  });

  it("clears the live latch when switching to a different chapter without live collaboration", () => {
    expect(resolveLiveCollaborationChapterId({
      selectedChapterId: "chapter-2",
      previousLiveChapterId: "chapter-1",
      isLiveCollaborationRequested: false,
      collaborationDisabledChapterId: null,
    })).toBeNull();
  });

  it("does not enable live collaboration for a disabled chapter", () => {
    expect(resolveLiveCollaborationChapterId({
      selectedChapterId: "chapter-1",
      previousLiveChapterId: null,
      isLiveCollaborationRequested: true,
      collaborationDisabledChapterId: "chapter-1",
    })).toBeNull();
  });

  it("keeps the editor local until the live transport is fully ready", () => {
    expect(getEditorTransportKey({
      selectedChapterId: "chapter-1",
      usesCollaborativeBody: true,
      sessionDocumentName: "chapter:chapter-1:body",
      hasProvider: false,
    })).toBe("local:chapter-1");

    expect(getEditorTransportKey({
      selectedChapterId: "chapter-1",
      usesCollaborativeBody: true,
      sessionDocumentName: "chapter:chapter-1:body",
      hasProvider: true,
    })).toBe("live:chapter:chapter-1:body");
  });

  it("blocks local editor hydration while a chapter is live", () => {
    expect(shouldApplyLocalEditorContent({
      draftMode: "live",
      currentHtml: "<p>old</p>",
      nextHtml: "<p>new</p>",
    })).toBe(false);

    expect(shouldApplyLocalEditorContent({
      draftMode: "local",
      currentHtml: "<p>old</p>",
      nextHtml: "<p>new</p>",
    })).toBe(true);
  });

  it("prefers the latest in-memory draft over cache and editor refs", () => {
    expect(getPreferredDraftContent({
      draftContent: "<p>draft</p>",
      cachedDraftContent: "<p>cached draft</p>",
      cachedContent: "<p>cache</p>",
      lastEditorContent: "<p>editor</p>",
    })).toBe("<p>draft</p>");

    expect(getPreferredDraftContent({
      draftContent: undefined,
      cachedDraftContent: "<p>cached draft</p>",
      cachedContent: "<p>cache</p>",
      lastEditorContent: "<p>editor</p>",
    })).toBe("<p>cached draft</p>");

    expect(getPreferredDraftContent({
      draftContent: undefined,
      cachedDraftContent: undefined,
      cachedContent: "<p>cache</p>",
      lastEditorContent: "<p>editor</p>",
    })).toBe("<p>cache</p>");
  });

  it("treats empty html as non-meaningful content", () => {
    expect(isMeaningfulEditorContent("<p></p>")).toBe(false);
    expect(isMeaningfulEditorContent("<p>Hello</p>")).toBe(true);
  });

  it("preserves the previous prose when a remounted editor comes back empty or loading", () => {
    expect(shouldPreservePreviousEditorContent({
      nextHtml: "<p></p>",
      previousHtml: "<p>Existing prose</p>",
    })).toBe(true);

    expect(shouldPreservePreviousEditorContent({
      nextHtml: "<p class='text-[var(--color-text-muted)] italic'>Loading</p>",
      previousHtml: "<p>Existing prose</p>",
    })).toBe(true);

    expect(getPreservedEditorContent({
      nextHtml: "<p></p>",
      previousHtml: "<p>Existing prose</p>",
    })).toBe("<p>Existing prose</p>");

    expect(getPreservedEditorContent({
      nextHtml: "<p>Fresh prose</p>",
      previousHtml: "<p>Existing prose</p>",
    })).toBe("<p>Fresh prose</p>");
  });

  it("finalizes live sync only after provider sync and editor render both happened", () => {
    expect(canFinalizeLiveCollaborationSync({
      providerSynced: true,
      editorRendered: false,
    })).toBe(false);

    expect(canFinalizeLiveCollaborationSync({
      providerSynced: false,
      editorRendered: true,
    })).toBe(false);

    expect(canFinalizeLiveCollaborationSync({
      providerSynced: true,
      editorRendered: true,
    })).toBe(true);
  });

  it("avoids republishing a stale saved title over a newer draft title", () => {
    expect(shouldPublishSavedTitle({
      savedTitle: "Original",
      latestTitle: "Revised",
    })).toBe(false);

    expect(shouldPublishSavedTitle({
      savedTitle: "Original",
      latestTitle: "Original",
    })).toBe(true);
  });

  it("forces a live content flush for risky save reasons", () => {
    expect(shouldFlushLiveCollaborativeContent({
      createVersion: false,
      reason: "blur",
    })).toBe(true);

    expect(shouldFlushLiveCollaborativeContent({
      createVersion: false,
      reason: "switch",
    })).toBe(true);

    expect(shouldFlushLiveCollaborativeContent({
      createVersion: false,
      reason: "unmount",
    })).toBe(true);
  });

  it("keeps routine live autosaves title-only unless an explicit flush was requested", () => {
    expect(shouldFlushLiveCollaborativeContent({
      createVersion: false,
      reason: "autosave",
    })).toBe(false);

    expect(shouldFlushLiveCollaborativeContent({
      createVersion: false,
      reason: "autosave",
      flushRequested: true,
    })).toBe(true);

    expect(shouldFlushLiveCollaborativeContent({
      createVersion: true,
      reason: "manual",
    })).toBe(true);
  });

  it("determines whether to schedule reconnect based on provider lifecycle and active chapter ID", () => {
    expect(shouldScheduleReconnect({
      isDestroying: false,
      isActive: true,
      selectedChapterId: "chapter-1",
      activeChapterId: "chapter-1",
    })).toBe(true);

    expect(shouldScheduleReconnect({
      isDestroying: true,
      isActive: true,
      selectedChapterId: "chapter-1",
      activeChapterId: "chapter-1",
    })).toBe(false);

    expect(shouldScheduleReconnect({
      isDestroying: false,
      isActive: false,
      selectedChapterId: "chapter-1",
      activeChapterId: "chapter-1",
    })).toBe(false);

    expect(shouldScheduleReconnect({
      isDestroying: false,
      isActive: true,
      selectedChapterId: "chapter-1",
      activeChapterId: "chapter-2",
    })).toBe(false);
  });

  describe("executeLiveSnapshot", () => {
    it("returns stale provider error if provider becomes stale before forceSync", async () => {
      const mockProvider: any = {
        forceSync: vi.fn(),
        hasUnsyncedChanges: false,
        on: vi.fn(),
        off: vi.fn(),
        sendStateless: vi.fn(),
      };

      const res = await executeLiveSnapshot(mockProvider, 1000, () => false);
      expect(res).toEqual({ ok: false, error: "Stale provider" });
      expect(mockProvider.forceSync).not.toHaveBeenCalled();
    });

    it("returns stale provider error if provider becomes stale during sync check loop", async () => {
      const mockProvider: any = {
        forceSync: vi.fn(),
        hasUnsyncedChanges: true,
        on: vi.fn(),
        off: vi.fn(),
        sendStateless: vi.fn(),
      };

      let active = true;
      const checkActive = () => active;

      const promise = executeLiveSnapshot(mockProvider, 1000, checkActive);

      setTimeout(() => {
        active = false;
      }, 20);

      const res = await promise;
      expect(res).toEqual({ ok: false, error: "Stale provider" });
    });

    it("returns timeout error if hasUnsyncedChanges is true past timeoutMs", async () => {
      const mockProvider: any = {
        forceSync: vi.fn(),
        hasUnsyncedChanges: true,
        on: vi.fn(),
        off: vi.fn(),
        sendStateless: vi.fn(),
      };

      const res = await executeLiveSnapshot(mockProvider, 50, () => true);
      expect(res.ok).toBe(false);
      expect(res.error).toContain("timeout");
    });
  });
});
