import { describe, expect, it, vi } from "vitest";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  canMergeBackgroundSaveRequests,
  canFinalizeLiveCollaborationSync,
  executeLiveSnapshot,
  getPreservedEditorContent,
  getPreferredDraftContent,
  getEditorTransportKey,
  isMeaningfulEditorContent,
  resolveExpectedUpdatedAt,
  resolveLiveCollaborationChapterId,
  shouldApplyLocalEditorContent,
  shouldFlushLiveCollaborativeContent,
  shouldPreservePreviousEditorContent,
  shouldPublishSavedTitle,
  shouldScheduleReconnect,
  shouldActivateLiveMode,
  validateCapturedLiveSaveContext,
  validateRetrySession,
  decideInitialHydration,
} from "@/components/mainEditorCollaboration";

type SnapshotProvider = {
  forceSync: ReturnType<typeof vi.fn>;
  hasUnsyncedChanges: boolean;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  sendStateless: ReturnType<typeof vi.fn>;
};

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
    })).toBe(false);

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

  it("resolves optimistic-lock timestamps from the matching chapter instead of the currently selected one", () => {
    expect(resolveExpectedUpdatedAt({
      chapterId: "chapter-1",
      projectChapters: [
        { id: "chapter-1", updatedAt: "2026-06-26T10:00:00.000Z" },
        { id: "chapter-2", updatedAt: "2026-06-26T11:00:00.000Z" },
      ],
      currentChapterId: "chapter-2",
      currentChapterUpdatedAt: "2026-06-26T11:00:00.000Z",
    })).toBe("2026-06-26T10:00:00.000Z");

    expect(resolveExpectedUpdatedAt({
      chapterId: "chapter-1",
      lastKnownUpdatedAt: "2026-06-26T12:00:00.000Z",
      projectChapters: [
        { id: "chapter-1", updatedAt: "2026-06-26T10:00:00.000Z" },
      ],
      currentChapterId: "chapter-1",
      currentChapterUpdatedAt: "2026-06-26T11:00:00.000Z",
    })).toBe("2026-06-26T12:00:00.000Z");
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

  it("flushes live content for routine autosaves and manual saves", () => {
    expect(shouldFlushLiveCollaborativeContent({
      createVersion: false,
      reason: "autosave",
    })).toBe(true);

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
      const mockProvider: SnapshotProvider = {
        forceSync: vi.fn(),
        hasUnsyncedChanges: false,
        on: vi.fn(),
        off: vi.fn(),
        sendStateless: vi.fn(),
      };

      const res = await executeLiveSnapshot(mockProvider as unknown as HocuspocusProvider, 1000, () => false);
      expect(res).toEqual({ ok: false, error: "Stale provider" });
      expect(mockProvider.forceSync).not.toHaveBeenCalled();
    });

    it("returns stale provider error if provider becomes stale during sync check loop", async () => {
      const mockProvider: SnapshotProvider = {
        forceSync: vi.fn(),
        hasUnsyncedChanges: true,
        on: vi.fn(),
        off: vi.fn(),
        sendStateless: vi.fn(),
      };

      let active = true;
      const checkActive = () => active;

      const promise = executeLiveSnapshot(mockProvider as unknown as HocuspocusProvider, 1000, checkActive);

      setTimeout(() => {
        active = false;
      }, 20);

      const res = await promise;
      expect(res).toEqual({ ok: false, error: "Stale provider" });
    });

    it("returns timeout error if hasUnsyncedChanges is true past timeoutMs", async () => {
      const mockProvider: SnapshotProvider = {
        forceSync: vi.fn(),
        hasUnsyncedChanges: true,
        on: vi.fn(),
        off: vi.fn(),
        sendStateless: vi.fn(),
      };

      const res = await executeLiveSnapshot(mockProvider as unknown as HocuspocusProvider, 50, () => true);
      expect(res.ok).toBe(false);
      expect(res.error).toContain("timeout");
    });
  });

  describe("shouldActivateLiveMode", () => {
    it("activates live mode only when requested and not disabled", () => {
      expect(shouldActivateLiveMode({
        selectedChapterId: "chapter-1",
        isLiveCollaborationRequested: true,
        collaborationDisabledChapterId: null,
      })).toBe(true);

      expect(shouldActivateLiveMode({
        selectedChapterId: null,
        isLiveCollaborationRequested: true,
        collaborationDisabledChapterId: null,
      })).toBe(false);

      expect(shouldActivateLiveMode({
        selectedChapterId: "chapter-1",
        isLiveCollaborationRequested: false,
        collaborationDisabledChapterId: null,
      })).toBe(false);

      expect(shouldActivateLiveMode({
        selectedChapterId: "chapter-1",
        isLiveCollaborationRequested: true,
        collaborationDisabledChapterId: "chapter-1",
      })).toBe(false);
    });
  });

  describe("validateRetrySession", () => {
    it("validates that retry request matches the current session, chapter and token", () => {
      expect(validateRetrySession({
        retryChapterId: "chapter-1",
        selectedChapterId: "chapter-1",
        retrySessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-1",
        retrySaveToken: 5,
        currentSaveToken: 5,
      })).toBe(true);

      expect(validateRetrySession({
        retryChapterId: "chapter-1",
        selectedChapterId: "chapter-2",
        retrySessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-1",
        retrySaveToken: 5,
        currentSaveToken: 5,
      })).toBe(false);

      expect(validateRetrySession({
        retryChapterId: "chapter-1",
        selectedChapterId: "chapter-1",
        retrySessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-2",
        retrySaveToken: 5,
        currentSaveToken: 5,
      })).toBe(false);

      expect(validateRetrySession({
        retryChapterId: "chapter-1",
        selectedChapterId: "chapter-1",
        retrySessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-1",
        retrySaveToken: 5,
        currentSaveToken: 6,
      })).toBe(false);
    });
  });

  describe("validateCapturedLiveSaveContext", () => {
    it("accepts normal queued live saves for the same chapter and session", () => {
      expect(validateCapturedLiveSaveContext({
        capturedChapterId: "chapter-1",
        activeChapterId: "chapter-1",
        capturedSessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-1",
      })).toBe(true);
    });

    it("rejects captured live saves when the chapter or session has changed", () => {
      expect(validateCapturedLiveSaveContext({
        capturedChapterId: "chapter-1",
        activeChapterId: "chapter-2",
        capturedSessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-1",
      })).toBe(false);

      expect(validateCapturedLiveSaveContext({
        capturedChapterId: "chapter-1",
        activeChapterId: "chapter-1",
        capturedSessionDocumentName: "doc-1",
        currentSessionDocumentName: "doc-2",
      })).toBe(false);
    });
  });

  describe("canMergeBackgroundSaveRequests", () => {
    it("merges only non-awaited non-retry background saves for the same chapter", () => {
      expect(canMergeBackgroundSaveRequests({
        current: {
          chapterId: "chapter-1",
          reason: "autosave",
          isRetry: false,
          awaited: false,
        },
        next: {
          chapterId: "chapter-1",
          reason: "blur",
          isRetry: false,
          awaited: false,
        },
      })).toBe(true);
    });

    it("rejects merge attempts for strict saves, retries, awaited saves, or different chapters", () => {
      expect(canMergeBackgroundSaveRequests({
        current: {
          chapterId: "chapter-1",
          reason: "autosave",
        },
        next: {
          chapterId: "chapter-1",
          reason: "manual",
        },
      })).toBe(false);

      expect(canMergeBackgroundSaveRequests({
        current: {
          chapterId: "chapter-1",
          reason: "autosave",
          isRetry: true,
        },
        next: {
          chapterId: "chapter-1",
          reason: "blur",
        },
      })).toBe(false);

      expect(canMergeBackgroundSaveRequests({
        current: {
          chapterId: "chapter-1",
          reason: "autosave",
          awaited: true,
        },
        next: {
          chapterId: "chapter-1",
          reason: "blur",
        },
      })).toBe(false);

      expect(canMergeBackgroundSaveRequests({
        current: {
          chapterId: "chapter-1",
          reason: "autosave",
        },
        next: {
          chapterId: "chapter-2",
          reason: "blur",
        },
      })).toBe(false);
    });
  });

  describe("decideInitialHydration", () => {
    it("adopts live content if there is no local recovery", () => {
      expect(decideInitialHydration({
        localRecovery: null,
        liveContent: "<p>live</p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "adopt_live" });
    });

    it("clears recovery if local recovery matches live content", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p>live</p>" },
        liveContent: "<p>live</p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "clear_recovery_and_live" });
    });

    it("keeps local and recovers if local recovery differs from live content", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Diff title", content: "<p>live</p>" },
        liveContent: "<p>live</p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "keep_local_and_recover" });

      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p>diff content</p>" },
        liveContent: "<p>live</p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "keep_local_and_recover" });
    });

    it("clears recovery if local recovery matches live content even with different HTML markup (normalized prose equality)", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p>live</p>" },
        liveContent: "<div>live</div>",
        liveTitle: " Title ",
        baseline: null,
      })).toEqual({ action: "clear_recovery_and_live" });
    });

    it("keeps local and recovers if local recovery differs in prose", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p>live content draft</p>" },
        liveContent: "<p>live content other</p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "keep_local_and_recover" });
    });

    it("falls back to local when live content is blank but baseline has meaningful prose and there is no local recovery", () => {
      expect(decideInitialHydration({
        localRecovery: null,
        liveContent: "<p></p>",
        liveTitle: "Title",
        baseline: { title: "Title", content: "<p>Saved prose</p>" },
      })).toEqual({ action: "fallback_to_local", title: "Title", content: "<p>Saved prose</p>" });
    });

    it("falls back to local when live content is blank but local recovery has meaningful prose", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p>My draft</p>" },
        liveContent: "<p></p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "fallback_to_local", title: "Title", content: "<p>My draft</p>" });
    });

    it("adopts blank live content when there is no local recovery and no meaningful baseline", () => {
      expect(decideInitialHydration({
        localRecovery: null,
        liveContent: "<p></p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "adopt_live" });
    });

    it("adopts blank live content when baseline exists but is also blank", () => {
      expect(decideInitialHydration({
        localRecovery: null,
        liveContent: "<p></p>",
        liveTitle: "Title",
        baseline: { title: "Title", content: "<p></p>" },
      })).toEqual({ action: "adopt_live" });
    });

    it("adopts live when local recovery is blank but live has meaningful content", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p></p>" },
        liveContent: "<p>live content</p>",
        liveTitle: "Title",
        baseline: null,
      })).toEqual({ action: "adopt_live" });
    });

    it("still keeps local when local recovery differs (not blank) even with blank live", () => {
      expect(decideInitialHydration({
        localRecovery: { title: "Title", content: "<p>Draft content</p>" },
        liveContent: "<p></p>",
        liveTitle: "Title",
        baseline: { title: "Title", content: "<p>Other</p>" },
      })).toEqual({ action: "fallback_to_local", title: "Title", content: "<p>Draft content</p>" });
    });
  });
});
