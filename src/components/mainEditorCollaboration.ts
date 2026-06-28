import { stripHtml } from "@/lib/utils";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export type DraftMode = "local" | "live";
export type DraftPersistenceReason = "manual" | "autosave" | "blur" | "switch" | "unmount";

async function waitForUnsyncedChangesToClear(
  provider: HocuspocusProvider,
  timeoutMs: number,
  isProviderActive?: () => boolean,
  startTime = Date.now(),
): Promise<boolean> {
  if (isProviderActive && !isProviderActive()) {
    return false;
  }

  if (!provider.hasUnsyncedChanges) {
    return true;
  }

  if (Date.now() - startTime > timeoutMs) {
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  return waitForUnsyncedChangesToClear(provider, timeoutMs, isProviderActive, startTime);
}

export const executeLiveSnapshot = async (
  provider: HocuspocusProvider,
  timeoutMs: number,
  isProviderActive?: () => boolean,
): Promise<{ ok: boolean; html?: string; error?: string }> => {
  const startTime = Date.now();

  if (isProviderActive && !isProviderActive()) {
    return { ok: false, error: "Stale provider" };
  }
  provider.forceSync();
  if (isProviderActive && !isProviderActive()) {
    return { ok: false, error: "Stale provider" };
  }

  const synced = await waitForUnsyncedChangesToClear(provider, timeoutMs, isProviderActive);
  if (!synced) {
    if (isProviderActive && !isProviderActive()) {
      return { ok: false, error: "Stale provider" };
    }
    return { ok: false, error: "Unsynced changes timeout" };
  }

  if (isProviderActive && !isProviderActive()) {
    return { ok: false, error: "Stale provider" };
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      provider.off("stateless", handleStateless);
      clearTimeout(timeout);
    };

    const handleStateless = ({ payload }: { payload: string }) => {
      try {
        const data = JSON.parse(payload);
        if (data.event === "chapter_snapshot_response" && data.requestId === requestId) {
          resolved = true;
          cleanup();
          resolve(data);
        }
      } catch {
        // ignore JSON parse errors from other messages
      }
    };

    provider.on("stateless", handleStateless);

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ ok: false, error: "Snapshot request timeout" });
      }
    }, Math.max(0, timeoutMs - (Date.now() - startTime)));

    provider.sendStateless(JSON.stringify({
      event: "chapter_snapshot_request",
      requestId,
    }));
  });
};

export function resolveLiveCollaborationChapterId(params: {
  selectedChapterId: string | null;
  previousLiveChapterId: string | null;
  isLiveCollaborationRequested: boolean;
  collaborationDisabledChapterId: string | null;
}) {
  const {
    selectedChapterId,
    previousLiveChapterId,
    isLiveCollaborationRequested,
    collaborationDisabledChapterId,
  } = params;

  if (!selectedChapterId) {
    return null;
  }

  if (previousLiveChapterId === selectedChapterId) {
    return previousLiveChapterId;
  }

  if (
    isLiveCollaborationRequested &&
    collaborationDisabledChapterId !== selectedChapterId
  ) {
    return selectedChapterId;
  }

  return null;
}

export function getEditorTransportKey(params: {
  selectedChapterId: string | null;
  usesCollaborativeBody: boolean;
  sessionDocumentName: string | null;
  hasProvider: boolean;
}) {
  const {
    selectedChapterId,
    usesCollaborativeBody,
    sessionDocumentName,
    hasProvider,
  } = params;

  if (!selectedChapterId) {
    return "empty";
  }

  if (usesCollaborativeBody && sessionDocumentName && hasProvider) {
    return `live:${sessionDocumentName}`;
  }

  return `local:${selectedChapterId}`;
}

export function getPreferredDraftContent(params: {
  draftContent: string | null | undefined;
  cachedDraftContent: string | null | undefined;
  cachedContent: string | undefined;
  lastEditorContent: string;
}) {
  const {
    draftContent,
    cachedDraftContent,
    cachedContent,
    lastEditorContent,
  } = params;
  return draftContent ?? cachedDraftContent ?? cachedContent ?? lastEditorContent;
}

export function shouldApplyLocalEditorContent(params: {
  draftMode: DraftMode | undefined;
  currentHtml: string;
  nextHtml: string;
}) {
  const { draftMode, currentHtml, nextHtml } = params;
  return draftMode !== "live" && currentHtml !== nextHtml;
}

export function canFinalizeLiveCollaborationSync(params: {
  providerSynced: boolean;
  editorRendered: boolean;
}) {
  return params.providerSynced && params.editorRendered;
}

export function isMeaningfulEditorContent(html: string) {
  return stripHtml(html).length > 0;
}

export function shouldPreservePreviousEditorContent(params: {
  nextHtml: string;
  previousHtml: string;
}) {
  const { nextHtml, previousHtml } = params;
  return isMeaningfulEditorContent(previousHtml) && !isMeaningfulEditorContent(nextHtml);
}

export function getPreservedEditorContent(params: {
  nextHtml: string;
  previousHtml: string;
}) {
  return shouldPreservePreviousEditorContent(params)
    ? params.previousHtml
    : params.nextHtml;
}

export function shouldPublishSavedTitle(params: {
  savedTitle: string;
  latestTitle: string | null | undefined;
}) {
  const { savedTitle, latestTitle } = params;
  return latestTitle == null || latestTitle === savedTitle;
}

export function resolveExpectedUpdatedAt(params: {
  chapterId: string;
  lastKnownUpdatedAt?: string;
  projectChapters?: Array<{ id: string; updatedAt: Date | string }> | null;
  currentChapterId?: string | null;
  currentChapterUpdatedAt?: Date | string | null;
}) {
  const {
    chapterId,
    lastKnownUpdatedAt,
    projectChapters,
    currentChapterId,
    currentChapterUpdatedAt,
  } = params;

  if (lastKnownUpdatedAt) {
    return lastKnownUpdatedAt;
  }

  const matchingChapterUpdatedAt = projectChapters?.find((chapter) => chapter.id === chapterId)?.updatedAt;
  if (matchingChapterUpdatedAt) {
    return typeof matchingChapterUpdatedAt === "string"
      ? matchingChapterUpdatedAt
      : matchingChapterUpdatedAt.toISOString();
  }

  if (currentChapterId !== chapterId || !currentChapterUpdatedAt) {
    return undefined;
  }

  return typeof currentChapterUpdatedAt === "string"
    ? currentChapterUpdatedAt
    : currentChapterUpdatedAt.toISOString();
}

export function shouldFlushLiveCollaborativeContent(params: {
  createVersion: boolean;
  reason: DraftPersistenceReason;
  flushRequested?: boolean;
}) {
  const { createVersion, reason, flushRequested = false } = params;
  return (
    createVersion ||
    flushRequested ||
    reason === "manual" ||
    reason === "autosave" ||
    reason === "blur" ||
    reason === "switch" ||
    reason === "unmount"
  );
}

export function shouldScheduleReconnect(params: {
  isDestroying: boolean;
  isActive: boolean;
  selectedChapterId: string | null;
  activeChapterId: string | null;
}) {
  return params.isActive && !params.isDestroying && params.selectedChapterId === params.activeChapterId;
}

export function shouldActivateLiveMode(params: {
  selectedChapterId: string | null;
  isLiveCollaborationRequested: boolean;
  collaborationDisabledChapterId: string | null;
}) {
  const { selectedChapterId, isLiveCollaborationRequested, collaborationDisabledChapterId } = params;
  return Boolean(
    selectedChapterId &&
    isLiveCollaborationRequested &&
    collaborationDisabledChapterId !== selectedChapterId
  );
}

export function validateRetrySession(params: {
  retryChapterId: string;
  selectedChapterId: string | null;
  retrySessionDocumentName: string | null;
  currentSessionDocumentName: string | null;
  retrySaveToken: number;
  currentSaveToken: number;
}) {
  const {
    retryChapterId,
    selectedChapterId,
    retrySessionDocumentName,
    currentSessionDocumentName,
    retrySaveToken,
    currentSaveToken,
  } = params;

  return (
    retryChapterId === selectedChapterId &&
    retrySessionDocumentName === currentSessionDocumentName &&
    retrySaveToken === currentSaveToken
  );
}

export function validateCapturedLiveSaveContext(params: {
  capturedChapterId: string;
  activeChapterId: string | null;
  capturedSessionDocumentName: string | null;
  currentSessionDocumentName: string | null;
}) {
  const {
    capturedChapterId,
    activeChapterId,
    capturedSessionDocumentName,
    currentSessionDocumentName,
  } = params;

  return (
    capturedChapterId === activeChapterId &&
    capturedSessionDocumentName === currentSessionDocumentName
  );
}

export function canMergeBackgroundSaveRequests(params: {
  current:
    | {
        chapterId: string;
        reason: DraftPersistenceReason;
        isRetry?: boolean;
        awaited?: boolean;
      }
    | null
    | undefined;
  next: {
    chapterId: string;
    reason: DraftPersistenceReason;
    isRetry?: boolean;
    awaited?: boolean;
  };
}) {
  const { current, next } = params;
  if (!current) {
    return false;
  }

  const isBackgroundReason = (reason: DraftPersistenceReason) =>
    reason === "autosave" || reason === "blur";

  return (
    current.chapterId === next.chapterId &&
    isBackgroundReason(current.reason) &&
    isBackgroundReason(next.reason) &&
    !current.isRetry &&
    !next.isRetry &&
    !current.awaited &&
    !next.awaited
  );
}

export function decideInitialHydration(params: {
  localRecovery: { title: string; content: string } | null | undefined;
  liveContent: string;
  liveTitle: string;
  baseline: { title: string; content: string } | null | undefined;
}) {
  const { localRecovery, liveContent, liveTitle, baseline } = params;

  const liveIsBlank = !isMeaningfulEditorContent(liveContent);

  if (!localRecovery) {
    if (liveIsBlank && baseline && isMeaningfulEditorContent(baseline.content)) {
      return { action: "fallback_to_local" as const, title: baseline.title, content: baseline.content };
    }
    return { action: "adopt_live" as const };
  }

  if (liveIsBlank && isMeaningfulEditorContent(localRecovery.content)) {
    return { action: "fallback_to_local" as const, title: localRecovery.title, content: localRecovery.content };
  }

  const localRecoveryIsBlank = !isMeaningfulEditorContent(localRecovery.content);
  if (localRecoveryIsBlank && !liveIsBlank) {
    return { action: "adopt_live" as const };
  }

  const titleMatch = localRecovery.title.trim() === liveTitle.trim();
  const contentMatch = stripHtml(localRecovery.content) === stripHtml(liveContent);

  if (titleMatch && contentMatch) {
    return { action: "clear_recovery_and_live" as const };
  }

  return { action: "keep_local_and_recover" as const };
}
