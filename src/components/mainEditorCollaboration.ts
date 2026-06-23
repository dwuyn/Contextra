import { stripHtml } from "@/lib/utils";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export type DraftMode = "local" | "live";
export type DraftPersistenceReason = "manual" | "autosave" | "blur" | "switch" | "unmount";

const LOCAL_LOADING_MARKER = "text-[var(--color-text-muted)] italic";

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
  isProviderActive?: () => boolean
): Promise<{ ok: boolean; html?: string; error?: string }> => {
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
  return (
    isMeaningfulEditorContent(previousHtml) &&
    (!isMeaningfulEditorContent(nextHtml) || nextHtml.includes(LOCAL_LOADING_MARKER))
  );
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

export function shouldFlushLiveCollaborativeContent(params: {
  createVersion: boolean;
  reason: DraftPersistenceReason;
  flushRequested?: boolean;
}) {
  const { createVersion, reason, flushRequested = false } = params;
  return (
    createVersion ||
    flushRequested ||
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
