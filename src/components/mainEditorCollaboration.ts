import { stripHtml } from "@/lib/utils";

export type DraftMode = "local" | "live";
export type DraftPersistenceReason = "manual" | "autosave" | "blur" | "switch" | "unmount";

const LOCAL_LOADING_MARKER = "text-[var(--color-text-muted)] italic";

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
