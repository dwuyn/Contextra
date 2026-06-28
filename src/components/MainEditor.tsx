"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Wand2,
  Sparkles,
  MessageSquare,
  Zap,
  Globe,
  Search,
  Download,
  History,
  Save,
  X,
  Maximize2,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { rewriteAction, describeAction } from "@/actions/ai";
import { exportProjectAction } from "@/actions/export";
import { createCommentThread, updateChapter } from "@/actions/projects";
import { fetchChapterContent } from "@/lib/chapterContentClient";
import { createChapterEditorExtensions } from "@/lib/tiptap/chapterEditorExtensions";
import { cn } from "@/lib/utils";
import { EditorFormattingToolbar } from "@/components/EditorFormattingToolbar";
import { ChapterIllustrationPage } from "@/components/ChapterIllustrationPage";
import { PublicVoiceReader } from "@/components/PublicVoiceReader";
import {
  canMergeBackgroundSaveRequests,
  canFinalizeLiveCollaborationSync,
  validateCapturedLiveSaveContext,
  getPreferredDraftContent,
  getPreservedEditorContent,
  getEditorTransportKey,
  resolveExpectedUpdatedAt,
  resolveLiveCollaborationChapterId,
  shouldApplyLocalEditorContent,
  shouldFlushLiveCollaborativeContent,
  shouldPreservePreviousEditorContent,
  shouldPublishSavedTitle,
  validateRetrySession,
  isMeaningfulEditorContent,
  decideInitialHydration,
  type DraftPersistenceReason,
  type DraftMode,
} from "@/components/mainEditorCollaboration";
import { resolvePromptLanguage, type PromptLanguage } from "@/services/promptLanguageService";
import { useProjectStore } from "@/store/useProjectStore";
import { useZenStore } from "@/store/useZenStore";
import type { ChapterIllustrationMeta, ProjectCollaborationSession } from "@/types/project";

type SaveReason = DraftPersistenceReason;

type SaveAttemptResult = "saved" | "noop" | "stale_context" | "failed" | "conflict";

type SaveRequest = {
  createVersion: boolean;
  reason: SaveReason;
  flushCollaborativeContent?: boolean;
  draft?: DraftSnapshot;
  isRetry?: boolean;
  projectId?: string;
  chapterId?: string;
  modeAtCapture?: DraftMode;
  sessionDocumentName?: string | null;
  saveToken?: number;
  awaited?: boolean;
  resolve?: (value: SaveAttemptResult) => void;
  providerAtCapture?: HocuspocusProvider | null;
  sessionAtCapture?: ProjectCollaborationSession | null;
  collabStateAtCapture?: CollaborationState;
};


type ChapterSnapshot = {
  title: string;
  content: string;
};

type DraftSnapshot = {
  projectId: string;
  chapterId: string;
  title: string;
  content: string;
};

type PendingCommentDraft = {
  threadId: string;
  from: number;
  to: number;
  selectedText: string;
  content: string;
  originalContent: string;
};

type CollaborationState = "idle" | "connecting" | "connected" | "synced" | "disconnected" | "error";

type LocalFallbackInfo = {
  chapterId: string;
  detail: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function toRichTextHtml(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";

  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => {
      const trimmed = block.trim();
      return trimmed ? [trimmed] : [];
    })
    .map((block) => {
      if (/^#{1,6}\s+/.test(block)) {
        const match = block.match(/^(#{1,6})\s+(.*)$/);
        if (!match) return `<p>${escapeHtml(block)}</p>`;
        const level = Math.min(match[1].length, 6);
        return `<h${level}>${escapeHtml(match[2].trim())}</h${level}>`;
      }

      const lines = block.split("\n").flatMap((line) => {
        const trimmed = line.trim();
        return trimmed ? [trimmed] : [];
      });

      if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }

      if (lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line))) {
        return `<ol>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      }

      return `<p>${lines.map((line) => escapeHtml(line)).join("<br>")}</p>`;
    })
    .join("");
}

function createEmptyDraftSnapshot(): DraftSnapshot {
  return {
    projectId: "",
    chapterId: "",
    title: "",
    content: "",
  };
}

function toChapterSnapshot(snapshot: Pick<DraftSnapshot, "title" | "content">): ChapterSnapshot {
  return {
    title: snapshot.title,
    content: snapshot.content,
  };
}

function hasSnapshotChanges(previous: ChapterSnapshot | undefined, next: Pick<DraftSnapshot, "title" | "content">) {
  if (!previous) return false;
  return previous.title !== next.title || previous.content !== next.content;
}

function getSaveErrorMessage(reason: SaveReason) {
  switch (reason) {
    case "manual":
      return "Manual save failed. Check your connection and try again.";
    case "autosave":
    case "blur":
      return "Auto-save failed. Your changes are still local; click Save to retry.";
    default:
      return "Save failed. Your latest changes may still be local.";
  }
}

function formatFallbackDebugValue(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildFallbackDetail(parts: Record<string, unknown>) {
  return Object.entries(parts)
    .flatMap(([key, value]) => {
      const formattedValue = formatFallbackDebugValue(value);
      return formattedValue ? [`${key}=${formattedValue}`] : [];
    })
    .join(" | ");
}



const COLLABORATIVE_CONTENT_FLUSH_INTERVAL_MS = 30_000;
const AUTOSAVE_INTERVAL_MS = 1_000;

function buildLanguageSignals({
  projectName,
  projectSummary,
  sharedNotes,
  chapterTitle,
  primaryText,
}: {
  projectName: string;
  projectSummary: string;
  sharedNotes: string;
  chapterTitle: string;
  primaryText: string;
}) {
  return resolvePromptLanguage({
    taskSignals: [
      { label: "current chapter text", text: primaryText },
      { label: "chapter title", text: chapterTitle },
    ],
    storySignals: [
      { label: "project title", text: projectName },
      { label: "shared notes", text: sharedNotes },
      { label: "project summary", text: projectSummary },
    ],
  });
}

function buildWriteMessage(language: PromptLanguage, textBefore: string, chapterTitle: string) {
  const trimmedTextBefore = textBefore.trim();
  const safeChapterTitle = chapterTitle.trim() || (language === "Vietnamese" ? "chương này" : "this chapter");

  if (!trimmedTextBefore) {
    return language === "Vietnamese"
      ? `Hãy viết phần mở đầu cho "${safeChapterTitle}". Giữ đúng giọng văn và ngữ cảnh hiện có. Viết khoảng 2-3 đoạn văn bằng tiếng Việt. Chỉ trả về phần nội dung truyện, không giải thích.`
      : `Write the opening for "${safeChapterTitle}". Keep the existing tone and context. Write about 2-3 paragraphs in English. Return only the story content with no explanation.`;
  }

  return language === "Vietnamese"
    ? `Hãy viết tiếp câu chuyện từ đoạn sau:\n\n${trimmedTextBefore}\n\nTiếp tục mạch truyện thật tự nhiên, giữ đúng giọng văn và phong cách hiện có. Viết khoảng 2-3 đoạn văn bằng tiếng Việt. Chỉ trả về phần nội dung tiếp nối, không giải thích.`
    : `Please continue the story from this point:\n\n${trimmedTextBefore}\n\nContinue the narrative naturally, maintaining the current tone and style. Provide about 2-3 paragraphs in English. Return only the continuation text with no explanation.`;
}

function buildBrainstormMessage(language: PromptLanguage) {
  return language === "Vietnamese"
    ? "Dựa trên chương hiện tại và toàn bộ ngữ cảnh câu chuyện, hãy đưa ra 5 ý tưởng brainstorm sáng tạo về những gì có thể xảy ra tiếp theo hoặc những chi tiết thú vị về thế giới và nhân vật đáng để khai thác. Trả lời bằng tiếng Việt."
    : "Based on the current chapter and story context, give me 5 creative brainstorming ideas for what could happen next, or some interesting world or character details to explore. Respond in English.";
}

function buildRewriteInstruction(language: PromptLanguage) {
  return language === "Vietnamese"
    ? "Viết lại đoạn này sao cho giàu hình ảnh và cảm xúc hơn."
    : "Make it more vivid and emotional.";
}

function useMainEditorState({
  onOpenAiHistory,
}: {
  onOpenAiHistory?: () => void;
}) {
  const project = useProjectStore((state) => state.project);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const currentChapter = useProjectStore((state) => {
    const chapterId = state.selectedChapterId;
    return chapterId ? state.project?.chapters.find((chapter) => chapter.id === chapterId) ?? null : null;
  });
  const activeBranchId = useProjectStore((state) => state.activeBranchId);
  const createAiCard = useProjectStore((state) => state.createAiCard);
  const updateAiCard = useProjectStore((state) => state.updateAiCard);
  const setIsGenerating = useProjectStore((state) => state.setIsGenerating);
  const isGenerating = useProjectStore((state) => state.isGenerating);
  const pendingInsertion = useProjectStore((state) => state.pendingInsertion);
  const clearPendingInsertion = useProjectStore((state) => state.clearPendingInsertion);
  const updateChapterMetaLocally = useProjectStore((state) => state.updateChapterMetaLocally);
  const currentCachedContent = useProjectStore((state) => {
    const chapterId = state.selectedChapterId;
    return chapterId ? state.chapterContentCache[chapterId] : undefined;
  });
  const pendingChapterContentReplacement = useProjectStore((state) => {
    const chapterId = state.selectedChapterId;
    return chapterId ? state.pendingChapterContentReplacements[chapterId] ?? null : null;
  });
  const setChapterDraft = useProjectStore((state) => state.setChapterDraft);
  const clearChapterDraft = useProjectStore((state) => state.clearChapterDraft);
  const setChapterContent = useProjectStore((state) => state.setChapterContent);
  const consumeChapterContentReplacement = useProjectStore((state) => state.consumeChapterContentReplacement);
  const upsertCommentThread = useProjectStore((state) => state.upsertCommentThread);
  const setSelectedCommentThreadId = useProjectStore((state) => state.setSelectedCommentThreadId);
  const selectedCommentThreadId = useProjectStore((state) => state.selectedCommentThreadId);
  const pendingTitleFocusChapterId = useProjectStore((state) => state.pendingTitleFocusChapterId);
  const clearPendingTitleFocus = useProjectStore((state) => state.clearPendingTitleFocus);
  const remoteSaveNotice = useProjectStore((state) => state.remoteSaveNotice);
  const clearRemoteSaveNotice = useProjectStore((state) => state.setRemoteSaveNotice);
  const canEdit = !!project?.viewerAccess?.canEdit;
  const canCollaborate = !!project && !project.viewerAccess?.isPublicViewer;
  const { toggleZen } = useZenStore();
  const t = useTranslations();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [title, setTitle] = useState(currentChapter?.title || "");
  const [collaborationDisabledChapterId, setCollaborationDisabledChapterId] = useState<string | null>(null);
  const [liveCollaborationChapterId, setLiveCollaborationChapterId] = useState<string | null>(null);
  const [collab, setCollab] = useState<{
    session: ProjectCollaborationSession | null;
    provider: HocuspocusProvider | null;
    state: CollaborationState;
    error: string | null;
  }>({ session: null, provider: null, state: "idle", error: null });
  const [collabPersistenceWarning, setCollabPersistenceWarning] = useState<string | null>(null);
  const [localFallbackInfo, setLocalFallbackInfo] = useState<LocalFallbackInfo | null>(null);
  const collabRef = useRef(collab);
  useEffect(() => {
    collabRef.current = collab;
  }, [collab]);
  const pendingRetryRequestsRef = useRef<Record<string, SaveRequest>>({});
  const saveTokensRef = useRef<Record<string, number>>({});
  const selectedChapterIdRef = useRef<string | null>(selectedChapterId);
  const currentSessionDocumentNameRef = useRef<string | null>(collab.session?.documentName ?? null);

  useEffect(() => {
    selectedChapterIdRef.current = selectedChapterId;
  }, [selectedChapterId]);

  useEffect(() => {
    currentSessionDocumentNameRef.current = collab.session?.documentName ?? null;
  }, [collab.session?.documentName]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPendingPersistence, setHasPendingPersistence] = useState(false);
  const [hasPendingCheckpoint, setHasPendingCheckpoint] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState<{ latest: { title: string; summary: string; content: string; updatedAt: string } } | null>(null);
  const lastSaveUpdatedAtRef = useRef<Record<string, string>>({});
  const remoteSaveAvailableRef = useRef<Record<string, string>>({});
  const [recoveredUnsavedChanges, setRecoveredUnsavedChanges] = useState(false);
  const [pendingCommentDraft, setPendingCommentDraft] = useState<PendingCommentDraft | null>(null);
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [flippedIllustrationChapterId, setFlippedIllustrationChapterId] = useState<string | null>(null);
  const [generatingIllustrationChapterId, setGeneratingIllustrationChapterId] = useState<string | null>(null);
  const [illustrationErrorsByChapter, setIllustrationErrorsByChapter] = useState<Record<string, string>>({});

  const activeChapterIdRef = useRef<string | null>(null);
  const lastEditorContentRef = useRef("");
  const currentCachedContentRef = useRef(currentCachedContent);
  const currentChapterTitleRef = useRef(currentChapter?.title ?? "");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const latestDraftRef = useRef<DraftSnapshot>(createEmptyDraftSnapshot());
  const draftsByChapterIdRef = useRef<Record<string, DraftSnapshot>>({});
  const persistedSnapshotsRef = useRef<Record<string, ChapterSnapshot>>({});
  const checkpointSnapshotsRef = useRef<Record<string, ChapterSnapshot>>({});
  const collaborativeFlushedContentRef = useRef<Record<string, string>>({});
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<SaveRequest[]>([]);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const collaborativeFlushTimeoutRef = useRef<number | null>(null);
  const collaborationRetryTimeoutRef = useRef<number | null>(null);
  const collaborationSyncTimeoutRef = useRef<number | null>(null);
  const collaborationRetryCountRef = useRef(0);
  const collaborationReadyFrameRef = useRef<number | null>(null);
  const collaborationProviderSyncedRef = useRef(false);
  const collaborationEditorRenderedRef = useRef(false);
  const requestSaveRef = useRef<(request: SaveRequest) => void>(() => undefined);
  const canEditRef = useRef(canEdit);
  const canCollaborateRef = useRef(canCollaborate);
  const draftModesByChapterRef = useRef<Record<string, DraftMode>>({});
  const isLiveCollaborationRequested = false;
  const usesCollaborativeBody = selectedChapterId != null && liveCollaborationChapterId === selectedChapterId;
  const isLoadingContentRef = useRef(isLoadingContent);
  const isMountedRef = useRef(true);
  const suppressAutosaveRef = useRef(false);
  const presenceStateRef = useRef<"viewing" | "editing">("viewing");
  const presenceIntervalRef = useRef<number | null>(null);
  const collaborationProjectIdRef = useRef<string | null>(project?.metadata.id ?? null);
  const collaborationHasSyncedRef = useRef(false);
  const collaborationModeRef = useRef<DraftMode>("local");
  const collaborationExpectedContentRef = useRef("");
  const pendingUnmountSaveRef = useRef<Promise<void> | null>(null);

  const createDraftSnapshot = (): DraftSnapshot => ({
    ...latestDraftRef.current,
  });

  const setActiveDraft = (draft: DraftSnapshot) => {
    latestDraftRef.current = draft;
    draftsByChapterIdRef.current[draft.chapterId] = draft;
    return draft;
  };

  const setStoredDraft = (draft: DraftSnapshot) => {
    draftsByChapterIdRef.current[draft.chapterId] = draft;
    if (latestDraftRef.current.chapterId === draft.chapterId) {
      latestDraftRef.current = draft;
    }
    return draft;
  };

  const storeLocalDraft = useCallback((draft: Pick<DraftSnapshot, "chapterId" | "title" | "content">) => {
    setChapterDraft(draft.chapterId, toChapterSnapshot(draft));
  }, [setChapterDraft]);

  const storeLiveRecoveryDraft = useCallback((draft: Pick<DraftSnapshot, "chapterId" | "title" | "content">) => {
    setChapterDraft(draft.chapterId, {
      ...toChapterSnapshot(draft),
      origin: "live-recovery",
      savedAt: Date.now(),
    });
  }, [setChapterDraft]);

  const hasPendingDraftChanges = useCallback((
    chapterId: string,
    draft: Pick<DraftSnapshot, "title" | "content">,
    mode: DraftMode = draftModesByChapterRef.current[chapterId] ?? "local",
  ) => {
    const persisted = persistedSnapshotsRef.current[chapterId];
    if (mode === "live") {
      return hasSnapshotChanges(persisted, draft);
    }

    return (
      hasSnapshotChanges(persisted, draft) ||
      Boolean(useProjectStore.getState().chapterDraftCache[chapterId])
    );
  }, []);

  const clearAutosaveTimer = () => {
    if (autosaveTimeoutRef.current === null) return;
    window.clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = null;
  };

  const clearCollaborativeFlushTimer = useCallback(() => {
    if (collaborativeFlushTimeoutRef.current === null) return;
    window.clearTimeout(collaborativeFlushTimeoutRef.current);
    collaborativeFlushTimeoutRef.current = null;
  }, []);

  const clearCollaborationRetryTimer = useCallback(() => {
    if (collaborationRetryTimeoutRef.current === null) return;
    window.clearTimeout(collaborationRetryTimeoutRef.current);
    collaborationRetryTimeoutRef.current = null;
  }, []);

  const clearCollaborationSyncTimeout = useCallback(() => {
    if (collaborationSyncTimeoutRef.current === null) return;
    window.clearTimeout(collaborationSyncTimeoutRef.current);
    collaborationSyncTimeoutRef.current = null;
  }, []);

  const clearCollaborationReadyFrame = useCallback(() => {
    if (collaborationReadyFrameRef.current === null) return;
    window.cancelAnimationFrame(collaborationReadyFrameRef.current);
    collaborationReadyFrameRef.current = null;
  }, []);

  const hasPendingCollaborativeContentFlush = useCallback((chapterId: string, content: string) => (
    collaborativeFlushedContentRef.current[chapterId] !== content
  ), []);

  const hasPendingDraftPersistence = useCallback((
    draft: Pick<DraftSnapshot, "chapterId" | "title" | "content">,
    mode: DraftMode,
  ) => (
    hasPendingDraftChanges(draft.chapterId, draft, mode)
    || (mode === "live" && hasPendingCollaborativeContentFlush(draft.chapterId, draft.content))
  ), [hasPendingCollaborativeContentFlush, hasPendingDraftChanges]);

  const syncSaveState = useCallback((
    chapterId: string,
    nextTitle: string,
    nextContent: string,
    mode: DraftMode = draftModesByChapterRef.current[chapterId] ?? "local",
  ) => {
    const persisted = persistedSnapshotsRef.current[chapterId];
    const checkpoint = checkpointSnapshotsRef.current[chapterId];
    const hasUnsaved = hasPendingDraftPersistence(
      { chapterId, title: nextTitle, content: nextContent },
      mode,
    );
    const checkpointBaseline = checkpoint?.content ?? persisted?.content ?? nextContent;
    const checkpointDirty = checkpointBaseline !== nextContent;

    if (isMountedRef.current && activeChapterIdRef.current === chapterId) {
      setHasPendingPersistence(hasUnsaved);
      setHasPendingCheckpoint(checkpointDirty);
    }

    return { hasUnsaved, checkpointDirty };
  }, [hasPendingDraftPersistence]);

  const getExpectedUpdatedAt = useCallback((chapterId: string) => (
    resolveExpectedUpdatedAt({
      chapterId,
      lastKnownUpdatedAt: lastSaveUpdatedAtRef.current[chapterId],
      projectChapters: useProjectStore.getState().project?.chapters,
      currentChapterId: currentChapter?.id ?? null,
      currentChapterUpdatedAt: currentChapter?.updatedAt ?? null,
    })
  ), [currentChapter?.id, currentChapter?.updatedAt]);

  const getSelectedChapterDraftSnapshot = useCallback((projectId: string) => {
    if (!selectedChapterId) {
      return null;
    }

    const storeState = useProjectStore.getState();
    const cachedDraft = storeState.chapterDraftCache[selectedChapterId];
    const chapterDraft = latestDraftRef.current.chapterId === selectedChapterId
      ? latestDraftRef.current
      : draftsByChapterIdRef.current[selectedChapterId];

    return {
      projectId,
      chapterId: selectedChapterId,
      title: chapterDraft?.title ?? cachedDraft?.title ?? currentChapterTitleRef.current,
      content: getPreferredDraftContent({
        draftContent: chapterDraft?.content,
        cachedDraftContent: cachedDraft?.content,
        cachedContent: storeState.chapterContentCache[selectedChapterId],
        lastEditorContent: lastEditorContentRef.current,
      }),
    } satisfies DraftSnapshot;
  }, [selectedChapterId]);

  const snapshotEditorContent = useCallback((currentEditor: TiptapEditor | null) => {
    if (!currentEditor) {
      return;
    }

    const chapterId = activeChapterIdRef.current;
    if (!chapterId) {
      return;
    }

    let nextHtml = "";
    try {
      nextHtml = currentEditor.getHTML();
    } catch {
      return;
    }

    const existingDraft = draftsByChapterIdRef.current[chapterId]
      ?? (latestDraftRef.current.chapterId === chapterId ? latestDraftRef.current : undefined);
    const projectId = existingDraft?.projectId ?? project?.metadata.id;
    if (!projectId) {
      return;
    }

    const snapshotContent = getPreservedEditorContent({
      nextHtml,
      previousHtml: lastEditorContentRef.current,
    });
    const nextDraft = {
      projectId,
      chapterId,
      title: existingDraft?.title ?? currentChapterTitleRef.current,
      content: snapshotContent,
    } satisfies DraftSnapshot;

    lastEditorContentRef.current = snapshotContent;
    setChapterContent(chapterId, snapshotContent);
    setStoredDraft(nextDraft);

    if ((draftModesByChapterRef.current[chapterId] ?? "local") === "local") {
      storeLocalDraft(nextDraft);
    } else {
      storeLiveRecoveryDraft(nextDraft);
    }
  }, [project?.metadata.id, setChapterContent, storeLiveRecoveryDraft, storeLocalDraft]);

  const resetCollaborationState = useCallback(() => {
    clearCollaborativeFlushTimer();
    clearCollaborationRetryTimer();
    clearCollaborationSyncTimeout();
    clearCollaborationReadyFrame();
    collaborationProviderSyncedRef.current = false;
    collaborationEditorRenderedRef.current = false;
    setCollab({ session: null, provider: null, state: "idle", error: null });
    setCollabPersistenceWarning(null);
    pendingRetryRequestsRef.current = {};
    collaborationHasSyncedRef.current = false;
    collaborationRetryCountRef.current = 0;
  }, [clearCollaborativeFlushTimer, clearCollaborationReadyFrame, clearCollaborationRetryTimer, clearCollaborationSyncTimeout]);

  const reportLocalFallback = useCallback((params: {
    chapterId: string | null;
    errorMessage: string;
    trigger: string;
    context?: Record<string, unknown>;
  }) => {
    const { chapterId, errorMessage, trigger, context } = params;
    if (!chapterId) {
      return;
    }

    const debugContext = {
      trigger,
      collabState: collabRef.current.state,
      websocketUrl: collabRef.current.session?.websocketUrl ?? null,
      documentName: collabRef.current.session?.documentName ?? null,
      ...context,
    };

    console.error("[collab] Falling back to local editing", {
      chapterId,
      errorMessage,
      ...debugContext,
    });

    setLocalFallbackInfo({
      chapterId,
      detail: buildFallbackDetail(debugContext),
    });
  }, []);

  const finalizeLiveCollaborationSync = useCallback(() => {
    if (!canFinalizeLiveCollaborationSync({
      providerSynced: collaborationProviderSyncedRef.current,
      editorRendered: collaborationEditorRenderedRef.current,
    })) {
      if (process.env.NEXT_PUBLIC_COLLAB_DEBUG === "true") {
        console.log("[collab] finalizeLiveCollaborationSync - not ready yet", {
          providerSynced: collaborationProviderSyncedRef.current,
          editorRendered: collaborationEditorRenderedRef.current,
        });
      }
      return;
    }

    clearCollaborationReadyFrame();
    collaborationReadyFrameRef.current = window.requestAnimationFrame(() => {
      collaborationReadyFrameRef.current = null;
      if (!canFinalizeLiveCollaborationSync({
        providerSynced: collaborationProviderSyncedRef.current,
        editorRendered: collaborationEditorRenderedRef.current,
      })) {
        return;
      }

      if (process.env.NEXT_PUBLIC_COLLAB_DEBUG === "true") {
        console.log("[collab] finalizeLiveCollaborationSync - synced!");
      }
      setCollab((prev) => ({ ...prev, state: "synced", error: null }));
      clearCollaborationSyncTimeout();
      setIsLoadingContent(false);

      const currentChapterId = activeChapterIdRef.current;
      if (currentChapterId && pendingRetryRequestsRef.current[currentChapterId]) {
        const retryReq = pendingRetryRequestsRef.current[currentChapterId];
        
        const isSelectedChapter = selectedChapterIdRef.current === retryReq.chapterId;
        const isSameSession = currentSessionDocumentNameRef.current === retryReq.sessionDocumentName;
        const isNewestToken = saveTokensRef.current[currentChapterId] === retryReq.saveToken;

        if (isSelectedChapter && isSameSession && isNewestToken) {
          delete pendingRetryRequestsRef.current[currentChapterId];
          requestSaveRef.current(retryReq);
        } else {
          delete pendingRetryRequestsRef.current[currentChapterId];
        }
      }
    });
  }, [clearCollaborationReadyFrame, clearCollaborationSyncTimeout]);

  const handleCollaborationFirstRender = useCallback(() => {
    if (process.env.NEXT_PUBLIC_COLLAB_DEBUG === "true") {
      console.log("[collab] handleCollaborationFirstRender - providerSynced:", collaborationProviderSyncedRef.current);
    }
    collaborationEditorRenderedRef.current = true;
    finalizeLiveCollaborationSync();
  }, [finalizeLiveCollaborationSync]);

  const loadCollaborativeDraft = useCallback((
    nextDraft: DraftSnapshot,
    chapterId: string,
    content: string,
  ) => {
    activeChapterIdRef.current = chapterId;
    lastEditorContentRef.current = nextDraft.content;
    collaborationExpectedContentRef.current = content;
    setActiveDraft(nextDraft);

    if (!persistedSnapshotsRef.current[chapterId]) {
      persistedSnapshotsRef.current[chapterId] = toChapterSnapshot(nextDraft);
    }

    if (!checkpointSnapshotsRef.current[chapterId]) {
      checkpointSnapshotsRef.current[chapterId] = toChapterSnapshot(nextDraft);
    }

    clearAutosaveTimer();
    clearCollaborativeFlushTimer();
    setTitle(nextDraft.title);
    setSaveError(null);
    setSaveWarning(null);
    setHasSelection(false);
    setIsLoadingContent(!collaborationHasSyncedRef.current);
    syncSaveState(chapterId, nextDraft.title, content, "local");
  }, [clearCollaborativeFlushTimer, syncSaveState]);

  const disableLiveCollaboration = useCallback((chapterId: string | null) => {
    if (!chapterId) {
      return;
    }

    setLiveCollaborationChapterId((activeChapterId) => (
      activeChapterId === chapterId ? null : activeChapterId
    ));
    setCollaborationDisabledChapterId(chapterId);
    resetCollaborationState();
    setIsLoadingContent(false);
  }, [resetCollaborationState]);

  const persistDraft = async (request: SaveRequest): Promise<SaveAttemptResult> => {
    const draft = request.draft ?? createDraftSnapshot();
    const projectId = request.projectId;
    const chapterId = request.chapterId;
    if (!projectId || !chapterId) {
      return "noop";
    }

    if (draft.projectId !== projectId || draft.chapterId !== chapterId) {
      return "stale_context";
    }

    const draftMode = request.modeAtCapture ?? "local";
    const isCollaborativeDraft = draftMode === "live";
    const { hasUnsaved, checkpointDirty } = syncSaveState(draft.chapterId, draft.title, draft.content, draftMode);
    const shouldCreateVersion = request.createVersion && checkpointDirty;
    const shouldFlushCollaborativeContent = isCollaborativeDraft && shouldFlushLiveCollaborativeContent({
      createVersion: request.createVersion,
      reason: request.reason,
      flushRequested: request.flushCollaborativeContent,
    });
    const hasCollaborativeContentChanges = isCollaborativeDraft
      && hasPendingCollaborativeContentFlush(draft.chapterId, draft.content);
    const shouldSave = request.createVersion
      ? true
      : shouldFlushCollaborativeContent
        ? hasUnsaved || hasCollaborativeContentChanges
        : hasUnsaved;
    const shouldSurfaceStatus = request.reason !== "switch" && request.reason !== "unmount";

    if (!shouldSave) {
      return "noop";
    }

    if (isMountedRef.current && shouldSurfaceStatus && activeChapterIdRef.current === draft.chapterId) {
      setIsSaving(true);
      setSaveError(null);
      setSaveWarning(null);
    }

    try {
      if (shouldFlushCollaborativeContent && request.reason !== "unmount") {
        const activeSession = request.sessionAtCapture ?? collabRef.current.session;
        const currentSessionDocumentName = activeSession?.documentName ?? null;
        const isValidSession = validateCapturedLiveSaveContext({
          capturedChapterId: chapterId,
          activeChapterId: activeChapterIdRef.current,
          capturedSessionDocumentName: request.sessionDocumentName ?? null,
          currentSessionDocumentName,
        });

        if (!isValidSession) {
          return "stale_context";
        }
      }

      const expectedUpdatedAt = getExpectedUpdatedAt(draft.chapterId);
      const persistedContent = draft.content;
      const dbPromise = updateChapter(draft.projectId, draft.chapterId, {
        title: draft.title,
        content: persistedContent,
        createVersion: shouldCreateVersion,
        revalidate: request.reason === "manual",
        expectedUpdatedAt,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("Database save timeout")), 10000);
        dbPromise.finally(() => clearTimeout(timer));
      });

      const result = await Promise.race([dbPromise, timeoutPromise]);

      if ("status" in result && result.status === "conflict") {
        if (isMountedRef.current && activeChapterIdRef.current === draft.chapterId) {
          setSaveConflict({ latest: result.latest });
        }
        return "conflict";
      }

      const saveResult = result as { status: "saved"; updatedAt: string; collaborationWarning?: string | null };
      lastSaveUpdatedAtRef.current[draft.chapterId] = saveResult.updatedAt;
      delete remoteSaveAvailableRef.current[draft.chapterId];

      persistedSnapshotsRef.current[draft.chapterId] = toChapterSnapshot({
        title: draft.title,
        content: persistedContent,
      });

      if (shouldFlushCollaborativeContent) {
        collaborativeFlushedContentRef.current[draft.chapterId] = draft.content;
        clearCollaborativeFlushTimer();
      }
      const latestDraft = draftsByChapterIdRef.current[draft.chapterId] ?? draft;

      if (!isCollaborativeDraft) {
        if (hasSnapshotChanges(toChapterSnapshot(draft), latestDraft)) {
          storeLocalDraft(latestDraft);
        } else {
          clearChapterDraft(draft.chapterId);
        }
      } else {
        clearChapterDraft(draft.chapterId);
      }

      const projectState = useProjectStore.getState();
      const savedChapter = projectState.project?.chapters.find((chapter) => chapter.id === draft.chapterId);
      const nextMetaUpdate: {
        title?: string;
        updatedAt?: string;
      } = {
        updatedAt: saveResult.updatedAt,
      };
      if (
        shouldPublishSavedTitle({
          savedTitle: draft.title,
          latestTitle: latestDraft.title,
        }) &&
        savedChapter?.title !== draft.title
      ) {
        nextMetaUpdate.title = draft.title;
      }
      updateChapterMetaLocally(draft.chapterId, nextMetaUpdate);

      if (shouldCreateVersion) {
        checkpointSnapshotsRef.current[draft.chapterId] = toChapterSnapshot({
          title: draft.title,
          content: persistedContent,
        });
      }

      syncSaveState(draft.chapterId, latestDraft.title, latestDraft.content, draftMode);

      if (isMountedRef.current && shouldSurfaceStatus && activeChapterIdRef.current === draft.chapterId) {
        const nextWarning = [saveResult.collaborationWarning]
          .filter((warning): warning is string => Boolean(warning))
          .join(" ");

        setSaveWarning(nextWarning || null);
      }

      // Successful newer save: clear stale retry
      const pendingRetry = pendingRetryRequestsRef.current[draft.chapterId];
      if (pendingRetry && (request.saveToken === undefined || pendingRetry.saveToken <= request.saveToken)) {
        delete pendingRetryRequestsRef.current[draft.chapterId];
      }

      return "saved";
    } catch (error) {
      if (
        isMountedRef.current &&
        activeChapterIdRef.current === draft.chapterId &&
        shouldSurfaceStatus
      ) {
        setSaveError(getSaveErrorMessage(request.reason));
      }
      throw error;
    } finally {
      if (isMountedRef.current && shouldSurfaceStatus) {
        setIsSaving(false);
      }
    }
  };

  const queueSaveRequest = (request: SaveRequest) => {
    const lastQueuedRequest = queuedSaveRef.current[queuedSaveRef.current.length - 1];
    const canMerge = canMergeBackgroundSaveRequests({
      current: lastQueuedRequest,
      next: request,
    });

    if (canMerge) {
      const resolveCurrent = lastQueuedRequest.resolve;
      const resolveNext = request.resolve;

      queuedSaveRef.current[queuedSaveRef.current.length - 1] = {
        ...request,
        createVersion: lastQueuedRequest.createVersion || request.createVersion,
        flushCollaborativeContent: lastQueuedRequest.flushCollaborativeContent || request.flushCollaborativeContent,
        resolve: (result) => {
          resolveCurrent?.(result);
          resolveNext?.(result);
        }
      };
      return;
    }

    queuedSaveRef.current.push(request);
  };

  const executePersistDraft = async (nextRequest: SaveRequest) => {
    try {
      const result = await persistDraft(nextRequest);
      nextRequest.resolve?.(result);
    } catch (error) {
      const isStaleError = error instanceof Error && (
        error.message?.includes("Live collaboration is not connected/synced") ||
        error.message?.includes("Stale provider") ||
        error.message?.includes("Snapshot request timeout") ||
        error.message?.includes("Unsynced changes timeout")
      );

      if (isStaleError) {
        if (process.env.NEXT_PUBLIC_COLLAB_DEBUG === "true") {
          console.warn(`${nextRequest.reason} save postponed (stale connection context):`, error instanceof Error ? error.message : error);
        }
      } else {
        console.error(`${nextRequest.reason} save failed:`, error);
      }
      const isManual = nextRequest.reason === "manual";
      
      const currentSessionDocumentName = collabRef.current.session?.documentName ?? null;
      const currentSaveToken = saveTokensRef.current[nextRequest.chapterId!] ?? 0;
      const isSessionValid = validateRetrySession({
        retryChapterId: nextRequest.chapterId!,
        selectedChapterId: activeChapterIdRef.current,
        retrySessionDocumentName: nextRequest.sessionDocumentName ?? null,
        currentSessionDocumentName,
        retrySaveToken: nextRequest.saveToken ?? 0,
        currentSaveToken,
      });

      if (isStaleError && !isManual && !nextRequest.isRetry && isSessionValid) {
        pendingRetryRequestsRef.current[nextRequest.chapterId!] = {
          ...nextRequest,
          isRetry: true,
        };
      }
      nextRequest.resolve?.("failed");
    } finally {
      saveInFlightRef.current = false;

      const queuedRequest = queuedSaveRef.current.shift();
      if (queuedRequest) {
        saveInFlightRef.current = true;
        executePersistDraft(queuedRequest);
      }
    }
  };

  const requestSave = (request: SaveRequest): Promise<SaveAttemptResult> => {
    return new Promise<SaveAttemptResult>((resolve) => {
      const draft = request.draft ?? createDraftSnapshot();
      if (!draft.projectId || !draft.chapterId) {
        resolve("noop");
        return;
      }

      let saveToken = request.saveToken;
      let projectId = request.projectId;
      let chapterId = request.chapterId;
      let modeAtCapture = request.modeAtCapture;
      let sessionDocumentName = request.sessionDocumentName;
      let providerAtCapture = request.providerAtCapture;
      let sessionAtCapture = request.sessionAtCapture;
      let collabStateAtCapture = request.collabStateAtCapture;

      if (saveToken === undefined) {
        const cId = draft.chapterId;
        saveTokensRef.current[cId] = (saveTokensRef.current[cId] ?? 0) + 1;
        saveToken = saveTokensRef.current[cId];
        projectId = draft.projectId;
        chapterId = cId;
        modeAtCapture = draftModesByChapterRef.current[cId] ?? "local";
        sessionDocumentName = collabRef.current.session?.documentName ?? null;
        providerAtCapture = providerAtCapture ?? collabRef.current.provider;
        sessionAtCapture = sessionAtCapture ?? collabRef.current.session;
        collabStateAtCapture = collabStateAtCapture ?? collabRef.current.state;
      }

      const nextRequest: SaveRequest = {
        ...request,
        draft,
        projectId: projectId!,
        chapterId: chapterId!,
        modeAtCapture: modeAtCapture!,
        sessionDocumentName,
        saveToken: saveToken!,
        providerAtCapture,
        sessionAtCapture,
        collabStateAtCapture,
        resolve,
      };

      clearAutosaveTimer();
      const draftMode = draftModesByChapterRef.current[nextRequest.chapterId] ?? "local";
      if (
        draftMode !== "live" ||
        nextRequest.flushCollaborativeContent ||
        nextRequest.createVersion ||
        nextRequest.reason === "blur" ||
        nextRequest.reason === "switch" ||
        nextRequest.reason === "unmount"
      ) {
        clearCollaborativeFlushTimer();
      }

      if (saveInFlightRef.current) {
        queueSaveRequest(nextRequest);
        return;
      }

      saveInFlightRef.current = true;
      void executePersistDraft(nextRequest);
    });
  };

  const handleUnmountSave = useEffectEvent(() => {
    if (pendingUnmountSaveRef.current) return;

    const draft = createDraftSnapshot();
    if (!draft.projectId || !draft.chapterId) return;

    const draftMode = draftModesByChapterRef.current[draft.chapterId] ?? "local";
    const hasPendingSave = hasPendingDraftPersistence(draft, draftMode);
    if (!hasPendingSave) return;

    setChapterDraft(draft.chapterId, {
      title: draft.title,
      content: draft.content,
      origin: "local",
      savedAt: Date.now(),
    });

    const expectedUpdatedAt = getExpectedUpdatedAt(draft.chapterId);
    const url = `/api/projects/${encodeURIComponent(draft.projectId)}/chapters/${encodeURIComponent(draft.chapterId)}/save`;
    const body = JSON.stringify({
      title: draft.title,
      content: draft.content,
      expectedUpdatedAt,
    });

    const savePromise = fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .then(async (res) => {
        if (res.ok) {
          useProjectStore.getState().clearChapterDraft(draft.chapterId);
          return;
        }
        if (res.status === 409) {
          const data = await res.json().catch(() => null);
          console.warn("keepalive save conflict - draft preserved locally:", data);
          return;
        }
        throw new Error(`HTTP status ${res.status}`);
      })
      .catch((err) => {
        console.warn("keepalive save failed:", err);
      })
      .finally(() => {
        pendingUnmountSaveRef.current = null;
      });

    pendingUnmountSaveRef.current = savePromise;
  });

  const triggerCollaborationReconnect = useCallback(() => {
    if (!selectedChapterId) {
      return;
    }

    clearCollaborationRetryTimer();
    clearCollaborationSyncTimeout();
    clearCollaborationReadyFrame();
    setCollaborationDisabledChapterId(null);
    setLocalFallbackInfo((current) => (
      current?.chapterId === selectedChapterId ? null : current
    ));
    collaborationHasSyncedRef.current = false;
    collaborationProviderSyncedRef.current = false;
    collaborationEditorRenderedRef.current = false;
    collaborationRetryCountRef.current = 0;
    setCollab((prev) => ({
      ...prev,
      session: null,
      provider: null,
      state: "connecting",
      error: null,
    }));
  }, [clearCollaborationReadyFrame, clearCollaborationRetryTimer, clearCollaborationSyncTimeout, selectedChapterId]);

  useEffect(() => {
    canEditRef.current = canEdit;
    canCollaborateRef.current = canCollaborate;
    isLoadingContentRef.current = isLoadingContent;
    collaborationProjectIdRef.current = project?.metadata.id ?? null;
    currentCachedContentRef.current = currentCachedContent;
    currentChapterTitleRef.current = currentChapter?.title ?? "";
    requestSaveRef.current = requestSave;
  });

  useEffect(() => {
    if (currentChapter && currentChapter.title !== title && document.activeElement !== titleInputRef.current) {
      setTitle(currentChapter.title);
    }
  }, [currentChapter?.title, title]);

  useEffect(() => {
    if (!canCollaborate || !canEdit) {
      setLiveCollaborationChapterId(null);
      return;
    }

    setLiveCollaborationChapterId((previousLiveChapterId) => (
      resolveLiveCollaborationChapterId({
        selectedChapterId,
        previousLiveChapterId,
        isLiveCollaborationRequested,
        collaborationDisabledChapterId,
      })
    ));
  }, [canCollaborate, canEdit, collaborationDisabledChapterId, isLiveCollaborationRequested, selectedChapterId]);

  useEffect(() => {
    setCollaborationDisabledChapterId((chapterId) => (
      chapterId && chapterId !== selectedChapterId ? null : chapterId
    ));
  }, [selectedChapterId]);

  // Unmount save effect - must be declared BEFORE provider effects so cleanup runs AFTER them
  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      clearCollaborativeFlushTimer();
      isMountedRef.current = false;
      handleUnmountSave();
    };
  }, [clearCollaborativeFlushTimer]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        resetCollaborationState();
      }
    });

    return () => {
      active = false;
    };
  }, [
    resetCollaborationState,
    usesCollaborativeBody,
  ]);

  const scheduleAutosave = useCallback((draft: DraftSnapshot, hasUnsaved: boolean) => {
    clearAutosaveTimer();
    if (!canEditRef.current || isLoadingContentRef.current || !hasUnsaved) return;
    if (saveConflict) return;

    autosaveTimeoutRef.current = window.setTimeout(() => {
      requestSaveRef.current({ createVersion: false, reason: "autosave", draft });
    }, AUTOSAVE_INTERVAL_MS);
  }, [saveConflict]);

  const scheduleCollaborativeContentFlush = useCallback((draft: DraftSnapshot) => {
    if (
      !canEditRef.current ||
      isLoadingContentRef.current ||
      (draftModesByChapterRef.current[draft.chapterId] ?? "local") !== "live" ||
      !hasPendingCollaborativeContentFlush(draft.chapterId, draft.content) ||
      collaborativeFlushTimeoutRef.current !== null
    ) {
      return;
    }

    collaborativeFlushTimeoutRef.current = window.setTimeout(() => {
      collaborativeFlushTimeoutRef.current = null;

      const latestDraft = draftsByChapterIdRef.current[draft.chapterId]
        ?? (latestDraftRef.current.chapterId === draft.chapterId ? latestDraftRef.current : null);
      if (!latestDraft) {
        return;
      }

      if (
        (draftModesByChapterRef.current[draft.chapterId] ?? "local") !== "live" ||
        !hasPendingCollaborativeContentFlush(draft.chapterId, latestDraft.content)
      ) {
        return;
      }

      requestSaveRef.current({
        createVersion: false,
        reason: "autosave",
        flushCollaborativeContent: true,
        draft: latestDraft,
      });
    }, COLLABORATIVE_CONTENT_FLUSH_INTERVAL_MS);
  }, [hasPendingCollaborativeContentFlush]);

  const handleManualSave = () => {
    requestSave({ createVersion: true, reason: "manual" });
  };

  const handleReloadLatest = useCallback(async () => {
    if (!project || !currentChapter) return;
    setSaveConflict(null);
    setIsLoadingContent(true);
    try {
      const data = await fetchChapterContent(project.metadata.id, currentChapter.id);
      if (data && data.content) {
        const currentEditor = editorRef.current;
        useProjectStore.getState().setChapterContent(currentChapter.id, data.content);
        lastSaveUpdatedAtRef.current[currentChapter.id] = data.updatedAt;
        updateChapterMetaLocally(currentChapter.id, { title: data.title, updatedAt: data.updatedAt });
        setTitle(data.title);

        if (currentEditor) {
          currentEditor.commands.setContent(data.content, { emitUpdate: false });
          lastEditorContentRef.current = data.content;
        }

        persistedSnapshotsRef.current[currentChapter.id] = toChapterSnapshot({
          title: data.title,
          content: data.content,
        });
        syncSaveState(currentChapter.id, data.title, data.content, "local");
      }
    } catch (err) {
      console.error("Failed to reload latest chapter content", err);
    } finally {
      setIsLoadingContent(false);
    }
  }, [project, currentChapter, syncSaveState, updateChapterMetaLocally]);

  const handleReloadFromRemote = useCallback(async () => {
    if (!project || !currentChapter) return;
    setIsLoadingContent(true);
    try {
      const data = await fetchChapterContent(project.metadata.id, currentChapter.id);
      if (data && data.content) {
        const currentEditor = editorRef.current;
        useProjectStore.getState().setChapterContent(currentChapter.id, data.content);
        lastSaveUpdatedAtRef.current[currentChapter.id] = data.updatedAt;
        updateChapterMetaLocally(currentChapter.id, { title: data.title, updatedAt: data.updatedAt });
        setTitle(data.title);

        if (currentEditor) {
          currentEditor.commands.setContent(data.content, { emitUpdate: false });
          lastEditorContentRef.current = data.content;
        }

        persistedSnapshotsRef.current[currentChapter.id] = toChapterSnapshot({
          title: data.title,
          content: data.content,
        });
        syncSaveState(currentChapter.id, data.title, data.content, "local");
      }
    } catch (err) {
      console.error("Failed to reload remote chapter content", err);
    } finally {
      clearRemoteSaveNotice(null);
      setIsLoadingContent(false);
    }
  }, [clearRemoteSaveNotice, project, currentChapter, updateChapterMetaLocally, syncSaveState]);

  const handleCopyConflictText = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const text = currentEditor.getText();
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Failed to copy text", err);
    });
  }, []);

  const clearPresenceInterval = useCallback(() => {
    if (presenceIntervalRef.current === null) return;
    window.clearInterval(presenceIntervalRef.current);
    presenceIntervalRef.current = null;
  }, []);

  const postPresence = useCallback(async (payload: { action?: "upsert" | "leave"; chapterId?: string | null; state?: "viewing" | "editing"; keepalive?: boolean }) => {
    const projectId = collaborationProjectIdRef.current;
    if (!projectId || !canCollaborateRef.current) return;

    await fetch("/api/project-presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: payload.action ?? "upsert",
        projectId,
        chapterId: payload.chapterId ?? activeChapterIdRef.current ?? null,
        state: payload.state ?? presenceStateRef.current,
      }),
      keepalive: payload.keepalive,
    }).catch((error) => {
      console.error("Failed to update collaboration presence", error);
    });
  }, []);

  const startPresenceHeartbeat = useCallback(() => {
    clearPresenceInterval();
    if (!collaborationProjectIdRef.current || !canCollaborateRef.current) return;

    presenceIntervalRef.current = window.setInterval(() => {
      void postPresence({});
    }, 15_000);
  }, [clearPresenceInterval, postPresence]);

  const updatePresenceState = useCallback((state: "viewing" | "editing", chapterId?: string | null) => {
    if (!collaborationProjectIdRef.current || !canCollaborateRef.current) return;
    presenceStateRef.current = state;
    void postPresence({ chapterId, state });
  }, [postPresence]);

  const leavePresence = useCallback((keepalive = false) => {
    if (!collaborationProjectIdRef.current || !canCollaborateRef.current) return;
    clearPresenceInterval();
    void postPresence({ action: "leave", keepalive });
  }, [clearPresenceInterval, postPresence]);

  const editorTransportKey = getEditorTransportKey({
    selectedChapterId,
    usesCollaborativeBody,
    sessionDocumentName: collab.session?.documentName ?? null,
    hasProvider: Boolean(collab.provider),
  });
  const collaborativeReadOnly = usesCollaborativeBody && (collab.session?.readOnly ?? true);
  const hasLiveTransport = editorTransportKey.startsWith("live:");

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_COLLAB_DEBUG === "true") {
      console.log("[collab] Transport key:", editorTransportKey, "collab.state:", collab.state);
    }
  }, [editorTransportKey, collab.state]);

  const editorCanEdit =
    canEdit &&
    !isLoadingContent &&
    (!hasLiveTransport || collab.state === "synced") &&
    !collaborativeReadOnly;

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: createChapterEditorExtensions({
      collaborative: Boolean(usesCollaborativeBody && collab.provider),
      placeholder: canEdit ? t("editor.placeholder") : t("editor.emptyChapter"),
      provider: collab.provider,
      user: collab.session
        ? {
            name: collab.session.user.name,
            color: collab.session.user.color,
          }
        : null,
      onCollaborationFirstRender: handleCollaborationFirstRender,
    }),
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none min-h-[500px] text-lg leading-relaxed text-[var(--color-text)]",
        spellcheck: "false",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;

        const anchor = target.closest("[data-comment-thread-id]");
        if (!(anchor instanceof HTMLElement)) return false;

        const threadId = anchor.getAttribute("data-comment-thread-id");
        if (threadId) {
          setSelectedCommentThreadId(threadId);
        }
        return false;
      },
    },
    onBlur: () => {
      setHasSelection(false);
      if (canCollaborateRef.current) {
        updatePresenceState("viewing");
      }
      if (!canEditRef.current || isLoadingContentRef.current) return;
      requestSave({
        createVersion: false,
        reason: "blur",
        flushCollaborativeContent:
          (draftModesByChapterRef.current[activeChapterIdRef.current ?? ""] ?? "local") === "live",
      });
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      setHasSelection(!nextEditor.state.selection.empty);
    },
    onUpdate: ({ editor: nextEditor }) => {
      const chapterId = activeChapterIdRef.current;
      if (!chapterId || isLoadingContentRef.current) return;

      const nextContent = nextEditor.getHTML();
      if (!isMeaningfulEditorContent(nextContent)) return;
      lastEditorContentRef.current = nextContent;
      setChapterContent(chapterId, nextContent);
      const nextDraft = setActiveDraft({
        ...latestDraftRef.current,
        content: nextContent,
      });
      if ((draftModesByChapterRef.current[chapterId] ?? "local") === "local") {
        storeLocalDraft(nextDraft);
      } else {
        storeLiveRecoveryDraft(nextDraft);
      }

      if (suppressAutosaveRef.current) {
        suppressAutosaveRef.current = false;
        return;
      }

      setSaveError(null);
      if (canCollaborateRef.current && canEditRef.current) {
        updatePresenceState("editing");
      }
      const { hasUnsaved } = syncSaveState(chapterId, nextDraft.title, nextContent);
      scheduleAutosave(nextDraft, hasUnsaved);
      scheduleCollaborativeContentFlush(nextDraft);
    },
  }, [editorTransportKey]);

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    return () => {
      const chapterId = activeChapterIdRef.current;
      const knownDraft = chapterId ? draftsByChapterIdRef.current[chapterId] : null;
      if (knownDraft && !isMeaningfulEditorContent(lastEditorContentRef.current)) {
        return;
      }
      snapshotEditorContent(editor);
    };
  }, [editor, editorTransportKey, snapshotEditorContent]);

  const applyLocalEditorContent = useCallback((chapterId: string | null, nextHtml: string) => {
    if (!editor) {
      return false;
    }

    const draftMode = chapterId ? draftModesByChapterRef.current[chapterId] : undefined;
    const currentHtml = editor.getHTML();
    if (!shouldApplyLocalEditorContent({ draftMode, currentHtml, nextHtml })) {
      return false;
    }

    editor.commands.setContent(nextHtml, { emitUpdate: false });
    return true;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editorCanEdit);
  }, [editor, editorCanEdit]);

  useEffect(() => {
    if (!project?.metadata.id || !canCollaborate) return;

    clearPresenceInterval();
    presenceStateRef.current = "viewing";
    void postPresence({
      chapterId: selectedChapterId ?? null,
      state: "viewing",
    });
    startPresenceHeartbeat();

    return () => {
      clearPresenceInterval();
    };
  }, [clearPresenceInterval, project?.metadata.id, selectedChapterId, canCollaborate, postPresence, startPresenceHeartbeat]);

  useEffect(() => {
    return () => {
      leavePresence(true);
    };
  }, []);

  const handlePageHide = useEffectEvent(() => {
    handleUnmountSave();
    leavePresence(true);
  });

  const handleVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") {
      handleUnmountSave();
    }
  });

  useEffect(() => {
    if (!canCollaborate) return;

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canCollaborate]);

  useEffect(() => {
    if (!editor) return;

    let editorDom: HTMLElement | null = null;

    try {
      editorDom = editor.view.dom;
    } catch {
      return;
    }

    const activeElements = Array.from(
      editorDom.querySelectorAll<HTMLElement>("[data-comment-thread-active='true']")
    );
    activeElements.forEach((element) => {
      element.removeAttribute("data-comment-thread-active");
    });

    if (!selectedCommentThreadId) return;

    const anchors = Array.from(
      editorDom.querySelectorAll<HTMLElement>(`[data-comment-thread-id="${selectedCommentThreadId}"]`)
    );
    anchors.forEach((element) => {
      element.setAttribute("data-comment-thread-active", "true");
    });

    if (anchors[0]) {
      anchors[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [editor, selectedCommentThreadId, currentChapter?.id]);

  useEffect(() => {
    if (
      !pendingTitleFocusChapterId ||
      pendingTitleFocusChapterId !== selectedChapterId ||
      activeChapterIdRef.current !== selectedChapterId ||
      isLoadingContent ||
      !titleInputRef.current
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
      clearPendingTitleFocus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pendingTitleFocusChapterId, selectedChapterId, isLoadingContent, clearPendingTitleFocus]);

  useEffect(() => {
    if (!selectedChapterId || !currentChapter?.id) {
      activeChapterIdRef.current = null;
      collaborationModeRef.current = "local";
      collaborationExpectedContentRef.current = "";
      lastEditorContentRef.current = "";
      latestDraftRef.current = createEmptyDraftSnapshot();
      clearAutosaveTimer();
      clearCollaborativeFlushTimer();
      setIsLoadingContent(false);
      setHasSelection(false);

      return;
    }

    const projectId = project?.metadata.id;
    if (!projectId) return;

    let cancelled = false;
    setRecoveredUnsavedChanges(false);
    const previousChapterId = activeChapterIdRef.current;
    const previousChapterStillExists = previousChapterId
      ? useProjectStore.getState().project?.chapters.some((chapter) => chapter.id === previousChapterId)
      : false;

    const loadChapter = (draft: DraftSnapshot, source: "local" | "cache" | "server") => {
      if (cancelled) return;
      draftModesByChapterRef.current[draft.chapterId] = "local";
      collaborationModeRef.current = "local";
      collaborationExpectedContentRef.current = "";

      const persistedBaseline =
        source === "local"
          ? persistedSnapshotsRef.current[draft.chapterId] ?? toChapterSnapshot({
            title: currentChapterTitleRef.current || draft.title,
            content: currentCachedContentRef.current ?? draft.content,
          })
          : toChapterSnapshot(draft);

      activeChapterIdRef.current = draft.chapterId;
      lastEditorContentRef.current = draft.content;
      setActiveDraft(draft);
      if (source === "local") {
        const hasStoredLocalDraft = Boolean(useProjectStore.getState().chapterDraftCache[draft.chapterId]);
        if (hasStoredLocalDraft || hasSnapshotChanges(persistedSnapshotsRef.current[draft.chapterId], draft)) {
          storeLocalDraft(draft);
        }
      }

      if (!persistedSnapshotsRef.current[draft.chapterId] || source !== "local") {
        persistedSnapshotsRef.current[draft.chapterId] = persistedBaseline;
      }

      if (!checkpointSnapshotsRef.current[draft.chapterId]) {
        checkpointSnapshotsRef.current[draft.chapterId] = persistedBaseline;
      }

      clearAutosaveTimer();
      clearCollaborativeFlushTimer();
      setTitle(draft.title);
      setSaveError(null);
      setSaveWarning(null);
      setSaveConflict(null);
      setIsLoadingContent(false);
      setHasSelection(false);

      if (!lastSaveUpdatedAtRef.current[draft.chapterId] && currentChapter?.updatedAt) {
        lastSaveUpdatedAtRef.current[draft.chapterId] = typeof currentChapter.updatedAt === "string"
          ? currentChapter.updatedAt
          : currentChapter.updatedAt.toISOString();
      }

      syncSaveState(draft.chapterId, draft.title, draft.content, "local");
    };

    const runSwitchAndLoad = async () => {
      if (previousChapterId && previousChapterId !== selectedChapterId && previousChapterStillExists) {
        const oldDraft = createDraftSnapshot();
        const oldMode = draftModesByChapterRef.current[previousChapterId] ?? "local";

        delete pendingRetryRequestsRef.current[previousChapterId];

        const providerAtCapture = collabRef.current.provider;
        const sessionAtCapture = collabRef.current.session;
        const collabStateAtCapture = collabRef.current.state;

        if (providerAtCapture) {
          (providerAtCapture as unknown as { _isFlushingExit?: boolean })._isFlushingExit = true;
        }

        void requestSave({
          createVersion: false,
          reason: "switch",
          draft: oldDraft,
          flushCollaborativeContent: oldMode === "live",
          awaited: true,
          providerAtCapture,
          sessionAtCapture,
          collabStateAtCapture,
        })
          .then((result) => {
            if (result === "stale_context" || result === "failed" || result === "conflict") {
              setChapterDraft(previousChapterId, {
                title: oldDraft.title,
                content: oldDraft.content,
                origin: oldMode === "live" ? "live-recovery" : "local",
                savedAt: Date.now(),
              });
            }
          })
          .catch((err) => {
            console.error("Save failed on chapter switch:", err);
            setChapterDraft(previousChapterId, {
              title: oldDraft.title,
              content: oldDraft.content,
              origin: oldMode === "live" ? "live-recovery" : "local",
              savedAt: Date.now(),
            });
          })
          .finally(() => {
            if (providerAtCapture && (providerAtCapture as unknown as { _isFlushingExit?: boolean })._isFlushingExit) {
              providerAtCapture.destroy();
            }
          });
      }

      if (cancelled) return;

      if (previousChapterId === selectedChapterId) {
        return;
      }

      const storeState = useProjectStore.getState();
      const cachedDraft = storeState.chapterDraftCache[selectedChapterId];
      const isLiveRecoveryDraft = cachedDraft?.origin === "live-recovery" && isLiveCollaborationRequested;
      const localDraft = draftsByChapterIdRef.current[selectedChapterId] ?? (
        (cachedDraft && !isLiveRecoveryDraft)
          ? {
              projectId,
              chapterId: selectedChapterId,
              title: cachedDraft.title,
              content: cachedDraft.content,
            }
          : undefined
      );
      if (localDraft) {
        if (cachedDraft) {
          setRecoveredUnsavedChanges(true);
        }
        loadChapter({ ...localDraft, projectId, chapterId: selectedChapterId }, "local");
        return;
      }

      const nextTitle = currentChapterTitleRef.current || "";
      const cachedContent = storeState.chapterContentCache[selectedChapterId];

      if (cachedContent !== undefined) {
        const hasMeaningfulBaseline =
          isMeaningfulEditorContent(persistedSnapshotsRef.current[selectedChapterId]?.content ?? "") ||
          isMeaningfulEditorContent(draftsByChapterIdRef.current[selectedChapterId]?.content ?? "") ||
          isMeaningfulEditorContent(lastEditorContentRef.current);
        const cacheIsBlank = !isMeaningfulEditorContent(cachedContent);

        if (cacheIsBlank && hasMeaningfulBaseline) {
          // ponytail: skip blank cache, fetch from server when session has meaningful prose
        } else {
          loadChapter({
            projectId,
            chapterId: selectedChapterId,
            title: nextTitle,
            content: cachedContent,
          }, "cache");
          return;
        }
      }

      setIsLoadingContent(true);
      setSaveError(null);
      setSaveWarning(null);

      try {
        const data = await fetchChapterContent(projectId, selectedChapterId);
        if (cancelled) return;
        const nextContent = data.content || "";
        setChapterContent(selectedChapterId, nextContent);
        lastSaveUpdatedAtRef.current[selectedChapterId] = data.updatedAt;
        setTitle(data.title);
        updateChapterMetaLocally(selectedChapterId, { title: data.title, updatedAt: data.updatedAt });
        loadChapter({
          projectId,
          chapterId: selectedChapterId,
          title: data.title,
          content: nextContent,
        }, "server");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setIsLoadingContent(false);
          setSaveError("Could not load this chapter. Try switching chapters or refreshing.");
          setSaveWarning(null);
        }
      }
    };

    void runSwitchAndLoad();

    return () => {
      cancelled = true;
    };
  }, [
    clearCollaborativeFlushTimer,
    clearChapterDraft,
    selectedChapterId,
    project?.metadata.id,
    currentChapter?.id,
    setChapterContent,
    storeLocalDraft,
    syncSaveState,
  ]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!selectedChapterId || !currentChapter?.id) {
      applyLocalEditorContent(null, "");
      return;
    }

    if (!editorTransportKey.startsWith("local:")) {
      return;
    }

    if (isLoadingContent && activeChapterIdRef.current !== selectedChapterId) {
      return;
    }

    const projectId = project?.metadata.id;
    if (!projectId || activeChapterIdRef.current !== selectedChapterId) {
      return;
    }

    const nextDraft = getSelectedChapterDraftSnapshot(projectId);
    if (!nextDraft) {
      return;
    }

    applyLocalEditorContent(selectedChapterId, nextDraft.content || "");
  }, [
    applyLocalEditorContent,
    currentChapter?.id,
    editor,
    editorTransportKey,
    getSelectedChapterDraftSnapshot,
    isLoadingContent,
    project?.metadata.id,
    selectedChapterId,
    t,
  ]);

  useEffect(() => {
    if (!selectedChapterId || !currentChapter?.id) {
      return;
    }

    const projectId = project?.metadata.id;
    if (!projectId || activeChapterIdRef.current !== selectedChapterId) {
      return;
    }

    const nextMode: DraftMode = usesCollaborativeBody ? "live" : "local";
    const previousMode = collaborationModeRef.current;
    if (previousMode === nextMode) {
      return;
    }

    const nextDraft = getSelectedChapterDraftSnapshot(projectId) ?? {
      projectId,
      chapterId: selectedChapterId,
      title: currentChapterTitleRef.current,
      content: lastEditorContentRef.current,
    };
    const nextContent = nextDraft.content;

    if (usesCollaborativeBody) {
      loadCollaborativeDraft(nextDraft, selectedChapterId, nextContent);
      return;
    }

    activeChapterIdRef.current = selectedChapterId;
    lastEditorContentRef.current = nextContent;
    collaborationExpectedContentRef.current = "";
    setStoredDraft(nextDraft);
    if (previousMode === "live" && hasPendingDraftPersistence(nextDraft, "local")) {
      storeLocalDraft(nextDraft);
    } else {
      clearChapterDraft(selectedChapterId);
    }
    draftModesByChapterRef.current[selectedChapterId] = "local";
    collaborationModeRef.current = "local";

    if (!persistedSnapshotsRef.current[selectedChapterId]) {
      persistedSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(nextDraft);
    }
    if (!checkpointSnapshotsRef.current[selectedChapterId]) {
      checkpointSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(nextDraft);
    }

    clearAutosaveTimer();
    clearCollaborativeFlushTimer();
    setTitle(nextDraft.title);
    setHasSelection(false);
    setSaveError(null);
    setSaveWarning(null);
    setIsLoadingContent(false);
    syncSaveState(selectedChapterId, nextDraft.title, nextContent, "local");
  }, [
    clearCollaborativeFlushTimer,
    clearChapterDraft,
    currentChapter?.id,
    getSelectedChapterDraftSnapshot,
    hasPendingDraftPersistence,
    loadCollaborativeDraft,
    project?.metadata.id,
    selectedChapterId,
    storeLocalDraft,
    syncSaveState,
    usesCollaborativeBody,
  ]);

  useEffect(() => {
    if (
      !editor ||
      !selectedChapterId ||
      !currentChapter?.id ||
      !project?.metadata.id ||
      !pendingChapterContentReplacement ||
      usesCollaborativeBody
    ) {
      return;
    }

    const chapterDraft = latestDraftRef.current.chapterId === selectedChapterId
      ? latestDraftRef.current
      : draftsByChapterIdRef.current[selectedChapterId];
    const nextDraft = {
      projectId: project.metadata.id,
      chapterId: selectedChapterId,
      title: chapterDraft?.title ?? currentChapterTitleRef.current,
      content: pendingChapterContentReplacement.content,
    };

    activeChapterIdRef.current = selectedChapterId;
    lastEditorContentRef.current = nextDraft.content;
    collaborationExpectedContentRef.current = "";
    setStoredDraft(nextDraft);
    clearChapterDraft(selectedChapterId);
    draftModesByChapterRef.current[selectedChapterId] = "local";
    collaborationModeRef.current = "local";
    persistedSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(nextDraft);
    checkpointSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(nextDraft);

    clearAutosaveTimer();
    clearCollaborativeFlushTimer();
    setTitle(nextDraft.title);
    setSaveError(null);
    setSaveWarning(null);
    setHasSelection(false);
    setIsLoadingContent(false);
    applyLocalEditorContent(selectedChapterId, nextDraft.content || "");
    syncSaveState(selectedChapterId, nextDraft.title, nextDraft.content, "local");
    consumeChapterContentReplacement(selectedChapterId, pendingChapterContentReplacement.nonce);
  }, [
    applyLocalEditorContent,
    clearCollaborativeFlushTimer,
    clearChapterDraft,
    consumeChapterContentReplacement,
    currentChapter?.id,
    editor,
    pendingChapterContentReplacement,
    project?.metadata.id,
    selectedChapterId,
    syncSaveState,
    usesCollaborativeBody,
  ]);

  useEffect(() => {
    if (editor && pendingInsertion) {
      editor.chain().focus().insertContent(toRichTextHtml(pendingInsertion)).setAiGenerated().run();
      clearPendingInsertion();
    }
  }, [editor, pendingInsertion, clearPendingInsertion]);

  useEffect(() => {
    console.log("DEBUG [useEffect-sync]: Run!", {
      state: collab.state,
      selectedChapterId,
      collabState: collab.state,
      usesCollaborativeBody,
    });
    if (!editor || !usesCollaborativeBody || collab.state !== "synced" || !selectedChapterId || !project?.metadata.id) {
      return;
    }

    let cancelled = false;
    let attemptCount = 0;
    let frame: number | null = null;

    const finalizeSyncedDraft = () => {
      if (cancelled) {
        return;
      }

      const rawSyncedContent = editor.getHTML();
      const previousContent = collaborationExpectedContentRef.current;
      const isInitialLiveSync = (draftModesByChapterRef.current[selectedChapterId] ?? "local") !== "live";

      if (
        isInitialLiveSync &&
        shouldPreservePreviousEditorContent({
          nextHtml: rawSyncedContent,
          previousHtml: previousContent,
        }) &&
        attemptCount < 30
      ) {
        attemptCount += 1;
        frame = window.requestAnimationFrame(finalizeSyncedDraft);
        return;
      }

      const syncedContent = isInitialLiveSync
        ? getPreservedEditorContent({
            nextHtml: rawSyncedContent,
            previousHtml: previousContent,
          })
        : rawSyncedContent;

      const storeState = useProjectStore.getState();
      const cachedDraft = storeState.chapterDraftCache[selectedChapterId];
      if (isInitialLiveSync) {
        const syncedTitle = currentChapter?.title ?? currentChapterTitleRef.current ?? "";
        const persistedBaseline = persistedSnapshotsRef.current[selectedChapterId];
        const draftBaseline = draftsByChapterIdRef.current[selectedChapterId];
        const baseline = cachedDraft ?? persistedBaseline ?? draftBaseline ?? {
          title: syncedTitle,
          content: lastEditorContentRef.current,
        };

        const hydration = decideInitialHydration({
          localRecovery: cachedDraft,
          liveContent: syncedContent,
          liveTitle: syncedTitle,
          baseline: isMeaningfulEditorContent(baseline.content) ? baseline : null,
        });

        if (hydration.action === "clear_recovery_and_live") {
          clearChapterDraft(selectedChapterId);
        } else if (hydration.action === "keep_local_and_recover" || hydration.action === "fallback_to_local") {
          reportLocalFallback({
            chapterId: selectedChapterId,
            errorMessage: tRef.current("editor.collaboration.localFallback"),
            trigger: "initial-hydration",
            context: {
              hydrationAction: hydration.action,
              liveContentBlank: !isMeaningfulEditorContent(syncedContent),
              hasLocalRecovery: Boolean(cachedDraft),
            },
          });
          disableLiveCollaboration(selectedChapterId);

          const fallbackContent = hydration.action === "fallback_to_local"
            ? hydration.content
            : cachedDraft!.content;
          const fallbackTitle = hydration.action === "fallback_to_local"
            ? hydration.title
            : cachedDraft!.title;

          editor.commands.setContent(fallbackContent);
          setTitle(fallbackTitle);

          const nextDraft = {
            projectId: project.metadata.id,
            chapterId: selectedChapterId,
            title: fallbackTitle,
            content: fallbackContent,
          };
          setActiveDraft(nextDraft);
          lastEditorContentRef.current = fallbackContent;
          setChapterContent(selectedChapterId, fallbackContent);

          setChapterDraft(selectedChapterId, {
            title: fallbackTitle,
            content: fallbackContent,
            origin: "local",
            savedAt: Date.now(),
          });

          setRecoveredUnsavedChanges(true);
          syncSaveState(selectedChapterId, fallbackTitle, fallbackContent, "local");
          return;
        }
      }

      const chapterDraft = latestDraftRef.current.chapterId === selectedChapterId
        ? latestDraftRef.current
        : draftsByChapterIdRef.current[selectedChapterId];
 
      collaborationExpectedContentRef.current = syncedContent;
      lastEditorContentRef.current = syncedContent;
      setChapterContent(selectedChapterId, syncedContent);
      const syncedDraft = setStoredDraft({
        projectId: project.metadata.id,
        chapterId: selectedChapterId,
        title: isInitialLiveSync ? (currentChapter?.title ?? currentChapterTitleRef.current ?? "") : (chapterDraft?.title ?? currentChapterTitleRef.current),
        content: syncedContent,
      });
      clearChapterDraft(selectedChapterId);
 
      if (isInitialLiveSync) {
        setTitle(currentChapter?.title ?? currentChapterTitleRef.current ?? "");
        const baseline = persistedSnapshotsRef.current[selectedChapterId] ?? {
          title: currentChapter?.title ?? currentChapterTitleRef.current ?? "",
          content: syncedContent,
        };
        const isContentEqual = baseline.content === syncedContent;
        const isTitleEqual = baseline.title === (currentChapter?.title ?? currentChapterTitleRef.current ?? "");

        if (isContentEqual && isTitleEqual) {
          persistedSnapshotsRef.current[selectedChapterId] = baseline;
          checkpointSnapshotsRef.current[selectedChapterId] = checkpointSnapshotsRef.current[selectedChapterId] ?? baseline;
        }
      }
 
       draftModesByChapterRef.current[selectedChapterId] = "live";
       collaborationModeRef.current = "live";
       collaborativeFlushedContentRef.current[selectedChapterId] = syncedContent;
       syncSaveState(selectedChapterId, syncedDraft.title, syncedContent, "live");
     };
 
     finalizeSyncedDraft();
 
     return () => {
       cancelled = true;
       if (frame !== null) {
         window.cancelAnimationFrame(frame);
       }
     };
   }, [
     collab.state,
     clearChapterDraft,
     editor,
     project?.metadata.id,
     selectedChapterId,
     setChapterContent,
     syncSaveState,
     usesCollaborativeBody,
     currentChapter?.title,
     disableLiveCollaboration,
     reportLocalFallback,
     setChapterDraft,
     setRecoveredUnsavedChanges,
   ]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedDrafts = Object.values(draftsByChapterIdRef.current).some((draft) =>
        hasPendingDraftPersistence(
          draft,
          draftModesByChapterRef.current[draft.chapterId] ?? "local",
        )
      );
      if (!hasUnsavedDrafts) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingDraftPersistence]);

  const handleOpenCommentComposer = () => {
    if (!editor || !currentChapter) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
    if (!selectedText) return;

    if (usesCollaborativeBody && collab.state !== "synced") {
      setCommentError("Wait for live collaboration to reconnect before attaching a comment.");
      return;
    }

    if (!usesCollaborativeBody && (hasPendingPersistence || isSaving)) {
      setCommentError("Save the latest prose changes before attaching a comment.");
      return;
    }

    setCommentError(null);
    setPendingCommentDraft({
      threadId: crypto.randomUUID(),
      from,
      to,
      selectedText,
      content: "",
      originalContent: editor.getHTML(),
    });
  };

  const handleCreateComment = async () => {
    if (!project || !currentChapter || !editor || !pendingCommentDraft) return;

    const content = pendingCommentDraft.content.trim();
    if (!content) {
      setCommentError("Write a comment before posting.");
      return;
    }

    setIsCreatingComment(true);
    setCommentError(null);

    const chapterId = currentChapter.id;
    const originalContent = pendingCommentDraft.originalContent;

    try {
      const thread = await createCommentThread(project.metadata.id, {
        threadId: pendingCommentDraft.threadId,
        chapterId,
        selectedText: pendingCommentDraft.selectedText,
        content,
      });

      suppressAutosaveRef.current = true;
      editor
        .chain()
        .setTextSelection({ from: pendingCommentDraft.from, to: pendingCommentDraft.to })
        .setCommentAnchor({ threadId: pendingCommentDraft.threadId })
        .run();

      const anchoredContent = editor.getHTML();
      lastEditorContentRef.current = anchoredContent;
      const anchoredDraft = setStoredDraft({
        ...latestDraftRef.current,
        content: anchoredContent,
      });
      if (!usesCollaborativeBody) {
        storeLocalDraft(anchoredDraft);
      }
      setChapterContent(chapterId, anchoredContent);
      syncSaveState(chapterId, latestDraftRef.current.title, anchoredContent);
      upsertCommentThread(thread);
      setSelectedCommentThreadId(thread.id);
      setPendingCommentDraft(null);
    } catch (error) {
      if (!usesCollaborativeBody) {
        applyLocalEditorContent(chapterId, originalContent);
        lastEditorContentRef.current = originalContent;
        const restoredDraft = setStoredDraft({
          ...latestDraftRef.current,
          content: originalContent,
        });
        storeLocalDraft(restoredDraft);
        syncSaveState(chapterId, restoredDraft.title, originalContent);
      }
      setCommentError(error instanceof Error ? error.message : "Could not create this comment.");
    } finally {
      suppressAutosaveRef.current = false;
      setIsCreatingComment(false);
    }
  };

  const runAiToolbarAction = async ({
    type,
    pendingContent,
    errorContent,
    run,
  }: {
    type: string;
    pendingContent: string;
    errorContent: string;
    run: () => Promise<string>;
  }) => {
    onOpenAiHistory?.();
    const cardId = createAiCard({
      type,
      content: pendingContent,
      status: "loading",
    });

    setIsGenerating(true);
    try {
      const content = await run();
      updateAiCard(cardId, {
        content,
        status: "ready",
        errorMessage: undefined,
      });
    } catch (error) {
      console.error(error);
      updateAiCard(cardId, {
        content: errorContent,
        status: "error",
        errorMessage: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWrite = async () => {
    if (!editor || !project || isGenerating) return;
    const { state } = editor;
    const { selection } = state;
    const textBefore = state.doc.textBetween(Math.max(0, selection.from - 2000), selection.from, "\n");
    const promptLanguage = buildLanguageSignals({
      projectName: project.metadata.name,
      projectSummary: project.metadata.summary,
      sharedNotes: project.contextMemory.sharedNotes,
      chapterTitle: title || currentChapter?.title || "",
      primaryText: textBefore,
    });
    const message = buildWriteMessage(promptLanguage, textBefore, title || currentChapter?.title || "");

    await runAiToolbarAction({
      type: t("editor.ai.write"),
      pendingContent: t("editor.history.writeLoading"),
      errorContent: t("editor.history.writeError"),
      run: async () => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.metadata.id,
            branchId: activeBranchId,
            messages: [{ role: "user", content: message }],
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.text();
      },
    });
  };

  const handleRewrite = async (instructions = "Make it more vivid and emotional.") => {
    if (!editor || !project || isGenerating) return;
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, " ");
    if (!selection) return;
    const promptLanguage = buildLanguageSignals({
      projectName: project.metadata.name,
      projectSummary: project.metadata.summary,
      sharedNotes: project.contextMemory.sharedNotes,
      chapterTitle: title || currentChapter?.title || "",
      primaryText: selection,
    });
    const nextInstructions = instructions === "Make it more vivid and emotional."
      ? buildRewriteInstruction(promptLanguage)
      : instructions;

    await runAiToolbarAction({
      type: t("editor.ai.rewrite"),
      pendingContent: t("editor.history.rewriteLoading"),
      errorContent: t("editor.history.rewriteError"),
      run: async () => {
        const { result } = await rewriteAction(project.metadata.id, activeBranchId, {
          selection,
          instructions: nextInstructions,
        });
        return result;
      },
    });
  };

  const handleDescribe = async (sense = "sight") => {
    if (!editor || !project || isGenerating) return;
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, " ");
    if (!selection) return;

    await runAiToolbarAction({
      type: t("editor.ai.describe"),
      pendingContent: t("editor.history.describeLoading"),
      errorContent: t("editor.history.describeError"),
      run: async () => {
        const { result } = await describeAction(project.metadata.id, activeBranchId, {
          selection,
          sense,
        });
        return result;
      },
    });
  };

  const handleBrainstorm = async () => {
    if (!editor || !project || isGenerating) return;
    const chapterText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n").slice(-2000);
    const promptLanguage = buildLanguageSignals({
      projectName: project.metadata.name,
      projectSummary: project.metadata.summary,
      sharedNotes: project.contextMemory.sharedNotes,
      chapterTitle: title || currentChapter?.title || "",
      primaryText: chapterText,
    });
    const message = buildBrainstormMessage(promptLanguage);

    await runAiToolbarAction({
      type: t("editor.ai.brainstorm"),
      pendingContent: t("editor.history.brainstormLoading"),
      errorContent: t("editor.history.brainstormError"),
      run: async () => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.metadata.id,
            branchId: activeBranchId,
            messages: [{ role: "user", content: message }],
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.text();
      },
    });
  };

  const handleGenerateIllustration = async (customInstruction?: string) => {
    if (!editor || !project || !currentChapter || isGeneratingIllustration) return;

    setIllustrationErrorsByChapter((state) => {
      if (!state[currentChapter.id]) return state;
      const nextState = { ...state };
      delete nextState[currentChapter.id];
      return nextState;
    });
    setGeneratingIllustrationChapterId(currentChapter.id);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.metadata.id)}/chapters/${encodeURIComponent(currentChapter.id)}/illustration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterTitle: title.trim() || currentChapter.title || t("editor.untitledChapter"),
            chapterContent: editor.getHTML(),
            customInstruction,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { illustration: ChapterIllustrationMeta | null };
      updateChapterMetaLocally(currentChapter.id, {
        illustration: data.illustration,
      });
      setFlippedIllustrationChapterId(currentChapter.id);
    } catch (error) {
      setIllustrationErrorsByChapter((state) => ({
        ...state,
        [currentChapter.id]: error instanceof Error ? error.message : t("editor.illustration.generateError"),
      }));
    } finally {
      setGeneratingIllustrationChapterId((chapterId) => (chapterId === currentChapter.id ? null : chapterId));
    }
  };

  const handleKeyboardShortcuts = useEffectEvent((event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (!modifier || !editor || !project) return;

    if (!canEdit || isGenerating) return;

    if (event.key === "s") {
      event.preventDefault();
      handleManualSave();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleKeyboardShortcuts(event);
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const isCommentOnly = Boolean(canCollaborate && !canEdit);
  const isLiveConnectionIssue = usesCollaborativeBody && (collab.state === "disconnected" || collab.state === "error");
  const isLiveConnecting = usesCollaborativeBody && !isLiveConnectionIssue && collab.state !== "idle" && collab.state !== "synced";
  const isLocalEditingFallback =
    Boolean(selectedChapterId) &&
    isLiveCollaborationRequested &&
    collaborationDisabledChapterId === selectedChapterId;
  const localFallbackDetail = isLocalEditingFallback && localFallbackInfo?.chapterId === selectedChapterId
    ? localFallbackInfo.detail
    : null;
  const canReconnectLiveCollaboration = canEdit && isLiveCollaborationRequested && (
    isLocalEditingFallback ||
    collab.state === "disconnected" ||
    collab.state === "error"
  );
  const isIllustrationFlipped = Boolean(currentChapter && flippedIllustrationChapterId === currentChapter.id);
  const isGeneratingIllustration = Boolean(currentChapter && generatingIllustrationChapterId === currentChapter.id);
  const illustrationError = currentChapter ? illustrationErrorsByChapter[currentChapter.id] ?? null : null;
  const canManualSave =
    Boolean(selectedChapterId) &&
    !isLoadingContent &&
    canEdit &&
    (!hasLiveTransport || collab.state === "synced");
  const selectedChapterDraft = project?.metadata.id
    ? getSelectedChapterDraftSnapshot(project.metadata.id)
    : null;
  const voiceReaderTitle = title || currentChapter?.title || t("editor.untitledChapter");
  const voiceReaderContent = getPreferredDraftContent({
    draftContent: selectedChapterDraft?.content,
    cachedDraftContent: undefined,
    cachedContent: currentCachedContent,
    lastEditorContent: lastEditorContentRef.current,
  }) ?? "";
  const showIllustrationGenerationPanel = !project?.viewerAccess?.isPublicViewer;
  const orderedBranchChapters = (project?.chapters ?? [])
    .filter((chapter) => chapter.branchId === activeBranchId)
    .sort((a, b) => a.index - b.index)
    .map((chapter) => ({ id: chapter.id, title: chapter.title }));
  const illustration = currentChapter?.illustration ?? null;
  const illustrationContent = editor?.getHTML() ?? "";

  return {
    editor,
    currentChapter,
    t,
    isCommentOnly,
    isLiveConnectionIssue,
    isLiveConnecting,
    isLocalEditingFallback,
    localFallbackDetail,
    canReconnectLiveCollaboration,
    isIllustrationFlipped,
    isGeneratingIllustration,
    illustrationError,
    canManualSave,
    selectedChapterDraft,
    voiceReaderTitle,
    voiceReaderContent,
    isLoadingContent,
    title,
    setTitle,
    handleManualSave,
    saveError,
    setSaveError,
    saveConflict,
    handleReloadLatest,
    handleReloadFromRemote,
    remoteSaveNotice,
    clearRemoteSaveNotice,
    handleCopyConflictText,
    collab,
    triggerCollaborationReconnect,
    collabPersistenceWarning,
    commentError,
    setCommentError,
    pendingCommentDraft,
    setPendingCommentDraft,
    saveWarning,
    recoveredUnsavedChanges,
    setRecoveredUnsavedChanges,
    isCreatingComment,
    setIsCreatingComment,
    handleCreateComment,
    canCollaborate,
    illustrationContent,
    illustration,
    showIllustrationGenerationPanel,
    orderedBranchChapters,
    setFlippedIllustrationChapterId,
    handleGenerateIllustration,
    project,
    isGenerating,
    hasSelection,
    handleWrite,
    handleRewrite,
    handleDescribe,
    handleBrainstorm,
    canEdit,
    activeBranchId,
    isSaving,
    setIsSaving,
    hasPendingPersistence,
    setHasPendingPersistence,
    hasPendingCheckpoint,
    setHasPendingCheckpoint,
    isExporting,
    setIsExporting,
    toggleZen,
    handleOpenCommentComposer,
    usesCollaborativeBody,
    setActiveDraft,
    storeLocalDraft,
    storeLiveRecoveryDraft,
    syncSaveState,
    scheduleAutosave,
    draftModesByChapterRef,
    latestDraftRef,
    titleInputRef,
    activeChapterIdRef,
    lastEditorContentRef,
    currentCachedContentRef,
  };
}

type MainEditorState = ReturnType<typeof useMainEditorState>;
type ReadyMainEditorState = MainEditorState & {
  editor: NonNullable<MainEditorState["editor"]>;
  currentChapter: NonNullable<MainEditorState["currentChapter"]>;
};

export function MainEditor({
  onToggleHistory,
  onOpenAiHistory,
}: {
  onToggleHistory?: () => void;
  onOpenAiHistory?: () => void;
}) {
  const state = useMainEditorState({ onOpenAiHistory });

  if (!state.currentChapter) {
    return (
      <div className="flex h-full flex-col bg-[var(--background)]">
        <div className="flex-1 px-20 py-20">
          <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
            <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/70 px-10 py-12 text-center shadow-sm">
              <h2 className="text-2xl font-bold text-[var(--color-text)]">
                {state.t("editor.noChapter.title")}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {state.t("editor.noChapter.description")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!state.editor) return null;

  const readyState = state as ReadyMainEditorState;

  const {
    canEdit,
    canCollaborate,
    isIllustrationFlipped,
    setFlippedIllustrationChapterId,
    handleGenerateIllustration,
    illustrationContent,
    illustration,
    showIllustrationGenerationPanel,
    isGeneratingIllustration,
    illustrationError,
    project,
    title,
    t,
    currentChapter,
  } = readyState;

  const readOnlyPage = <ReadOnlyEditorPage state={readyState} />;
  const editablePage = <EditableEditorPage state={readyState} onToggleHistory={onToggleHistory} />;
  const editorPage = !canEdit && !canCollaborate ? readOnlyPage : editablePage;

  return (
    <div className="page-flip-stage h-full">
      <div className={cn("page-flip-book relative h-full", isIllustrationFlipped && "page-flip-book-flipped")}>
        <div className={cn("page-flip-face page-flip-front", isIllustrationFlipped && "pointer-events-none")}>
          {editorPage}
        </div>
        <div className={cn("page-flip-face page-flip-back", !isIllustrationFlipped && "pointer-events-none")}>
          <ChapterIllustrationPage
            key={currentChapter.id}
            chapterTitle={title || currentChapter.title || t("editor.untitledChapter")}
            projectName={project?.metadata.name ?? ""}
            chapterContent={illustrationContent}
            illustration={illustration}
            showGenerationPanel={showIllustrationGenerationPanel}
            canGenerate={canEdit}
            isGenerating={isGeneratingIllustration}
            error={illustrationError}
            onFlipBack={() => setFlippedIllustrationChapterId(null)}
            onGenerate={handleGenerateIllustration}
          />
        </div>
      </div>
    </div>
  );
}

function ReadOnlyEditorPage({ state }: { state: ReadyMainEditorState }) {
  const {
    t,
    project,
    setFlippedIllustrationChapterId,
    currentChapter,
    editor,
    voiceReaderTitle,
    voiceReaderContent,
    isLoadingContent,
    orderedBranchChapters,
  } = state;

  return (
    <div className="flex h-full flex-col bg-[var(--color-canvas)]">
      <div className="border-b border-[var(--color-border)]/50 bg-[var(--color-canvas)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-[var(--color-accent-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
              <Globe size={12} />
              {t("editor.readingMode")}
            </div>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <h2 className="min-w-0 truncate text-sm font-bold text-[var(--color-text-secondary)]">
              {project?.metadata?.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setFlippedIllustrationChapterId(currentChapter.id)}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-bold text-[var(--color-text)] shadow-sm transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            <BookOpen size={16} className="text-[var(--color-accent)]" />
            {t("editor.illustration.flip")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-20 py-20 pb-40 scroll-smooth bg-[var(--color-canvas)]">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-12 text-5xl font-extrabold leading-tight tracking-tight text-[var(--color-text)]">
            {currentChapter.title || t("editor.untitledChapter")}
          </h1>
          <div className="prose prose-slate max-w-none text-xl leading-relaxed text-[var(--color-text)]">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <PublicVoiceReader
        projectId={project?.metadata.id ?? currentChapter.projectId}
        chapterId={currentChapter.id}
        chapterTitle={voiceReaderTitle}
        chapterContent={voiceReaderContent}
        orderedBranchChapters={orderedBranchChapters}
      />
    </div>
  );
}

function EditableEditorHeader({
  state,
  onToggleHistory,
}: {
  state: ReadyMainEditorState;
  onToggleHistory?: () => void;
}) {
  const {
    isGenerating,
    canEdit,
    hasSelection,
    handleWrite,
    handleRewrite,
    handleDescribe,
    handleBrainstorm,
    isCommentOnly,
    isLocalEditingFallback,
    isLiveConnectionIssue,
    isLiveConnecting,
    handleManualSave,
    canManualSave,
    t,
    project,
    currentChapter,
    setFlippedIllustrationChapterId,
    isSaving,
    hasPendingPersistence,
    hasPendingCheckpoint,
    saveError,
    saveConflict,
    collabPersistenceWarning,
    saveWarning,
    isExporting,
    setIsExporting,
    toggleZen,
  } = state;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border)]/50 bg-[var(--color-canvas)] px-6 py-2">
      <div className="flex items-center gap-1 rounded-xl bg-[var(--color-canvas)] p-1">
        <button
          type="button"
          onClick={() => void handleWrite()}
          disabled={isGenerating || !canEdit}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-bold text-[var(--color-text)] shadow-sm transition-all hover:bg-[var(--color-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 size={16} className="text-[var(--color-accent)]" />
          {t("editor.ai.write")}
        </button>

        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleRewrite()}
          disabled={isGenerating || !hasSelection || !canEdit}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={16} className="text-[var(--color-accent)]" />
          {t("editor.ai.rewrite")}
        </button>

        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleDescribe()}
          disabled={isGenerating || !hasSelection || !canEdit}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageSquare size={16} className="text-[var(--color-accent)]" />
          {t("editor.ai.describe")}
        </button>

        <button
          type="button"
          onClick={() => void handleBrainstorm()}
          disabled={isGenerating || !canEdit}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Zap size={16} className="text-[var(--color-accent)]" />
          {t("editor.ai.brainstorm")}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {isCommentOnly && (
          <div className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-700">
            {t("editor.comment.commentingMode")}
          </div>
        )}
        {isLocalEditingFallback && (
          <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800">
            <AlertTriangle size={10} className="text-amber-600" />
            {t("editor.collaboration.localFallbackBadge")}
          </div>
        )}
        <button
          type="button"
          onClick={() => setFlippedIllustrationChapterId(currentChapter.id)}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-bold text-[var(--color-text)] shadow-sm transition-all hover:bg-[var(--color-surface-alt)]"
        >
          <BookOpen size={15} className="text-[var(--color-accent)]" />
          {t("editor.illustration.flip")}
        </button>
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
          <div
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              saveConflict
                ? "bg-[var(--color-destructive)]"
                : saveError || isLiveConnectionIssue
                  ? "bg-[var(--color-destructive)]"
                : collabPersistenceWarning
                  ? "bg-[var(--color-destructive)] animate-pulse"
                : isSaving || isLiveConnecting
                  ? "animate-pulse bg-[var(--color-accent)]/60"
                  : saveWarning
                    ? "bg-[var(--color-accent)]"
                    : hasPendingPersistence
                      ? "bg-[var(--color-text-muted)]"
                      : hasPendingCheckpoint
                        ? "bg-[var(--color-accent)]"
                        : "bg-[var(--color-success)]",
            )}
          />
          {saveConflict
            ? t("editor.conflict.title")
            : saveError
              ? t("editor.status.saveFailed")
              : collabPersistenceWarning
                ? collabPersistenceWarning
              : isLiveConnectionIssue
                ? t("editor.collaboration.liveOffline")
              : isSaving
                ? t("editor.status.saving")
              : isLiveConnecting
                ? t("editor.collaboration.liveSyncing")
              : saveWarning
                ? saveWarning
              : hasPendingPersistence
                ? t("editor.status.unsavedChanges")
              : hasPendingCheckpoint
                ? t("editor.status.autosavedCheckpointPending")
                : t("editor.status.saved")}
        </div>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleManualSave}
          disabled={!canManualSave || isSaving}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-bold text-[var(--color-text)] shadow-sm transition-all hover:bg-[var(--color-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={15} className="text-[var(--color-accent)]" />
          {isSaving ? t("editor.status.saving") : t("editor.saveCheckpoint")}
        </button>
        {onToggleHistory && (
          <button
            type="button"
            onClick={onToggleHistory}
            title={t("editor.history.historyButton")}
            className="cursor-pointer rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]"
          >
            <History size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            if (!project || isExporting) return;
            setIsExporting(true);
            try {
              const md = await exportProjectAction(project.metadata.id);
              const blob = new Blob([md], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = project.metadata.name.replace(/[^a-z0-9]/gi, "_") + ".md";
              anchor.click();
              URL.revokeObjectURL(url);
            } catch (error) {
              console.error(error);
            } finally {
              setIsExporting(false);
            }
          }}
          title={t("workspace.exportMarkdown")}
          disabled={isExporting}
          className="cursor-pointer rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={16} />
        </button>
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={toggleZen}
                className="cursor-pointer rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]"
                aria-label={t("zen.enter")}
              >
                <Maximize2 size={16} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
                sideOffset={5}
              >
                {t("zen.enter")}
                <Tooltip.Arrow className="fill-[var(--color-text)]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    </div>
  );
}

function RemoteSaveNoticeBanner({
  savedByName,
  onDismiss,
  onReload,
}: {
  savedByName: string;
  onDismiss: () => void;
  onReload: () => void;
}) {
  return (
    <div className="border-b border-[var(--color-border)]/50 bg-[var(--color-canvas)] px-6 py-4">
      <div className="rounded-2xl border border-[var(--color-accent-muted)] bg-[var(--color-accent-muted)]/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-[var(--color-accent)]">
              {savedByName} saved this chapter
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              The latest version is available. Reload to see the updated content.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onReload}
              className="rounded-xl border border-[var(--color-accent)]/25 bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--color-accent)]/90"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableEditorPage({
  state,
  onToggleHistory,
}: {
  state: ReadyMainEditorState;
  onToggleHistory?: () => void;
}) {
  const {
    editor,
    currentChapter,
    t,
    canEdit,
    hasSelection,
    handleRewrite,
    handleDescribe,
    isLocalEditingFallback,
    localFallbackDetail,
    recoveredUnsavedChanges,
    setRecoveredUnsavedChanges,
    voiceReaderTitle,
    voiceReaderContent,
    isLoadingContent,
    project,
    title,
    setTitle,
    setSaveError,
    activeChapterIdRef,
    latestDraftRef,
    draftModesByChapterRef,
    titleInputRef,
    lastEditorContentRef,
    usesCollaborativeBody,
    hasPendingPersistence,
    orderedBranchChapters,
    isSaving,
    collab,
    isCreatingComment,
    handleOpenCommentComposer,
    saveError,
    collabPersistenceWarning,
    commentError,
    setCommentError,
    saveWarning,
    pendingCommentDraft,
    setPendingCommentDraft,
    handleCreateComment,
    saveConflict,
    handleReloadLatest,
    handleReloadFromRemote,
    remoteSaveNotice,
    clearRemoteSaveNotice,
    handleCopyConflictText,
  } = state;

  return (
    <div className="flex h-full flex-col bg-[var(--color-canvas)]">
      <EditableEditorHeader state={state} onToggleHistory={onToggleHistory} />

      {remoteSaveNotice && remoteSaveNotice.chapterId === currentChapter.id && (
        <RemoteSaveNoticeBanner
          savedByName={remoteSaveNotice.savedByName}
          onDismiss={() => clearRemoteSaveNotice(null)}
          onReload={handleReloadFromRemote}
        />
      )}

      <EditorFormattingToolbar
        editor={editor}
        canEdit={canEdit}
        labels={{
          bold: t("editor.toolbar.bold"),
          italic: t("editor.toolbar.italic"),
          underline: t("editor.toolbar.underline"),
          bulletList: t("editor.toolbar.bulletList"),
          orderedList: t("editor.toolbar.orderedList"),
          alignLeft: t("editor.toolbar.alignLeft"),
          alignCenter: t("editor.toolbar.alignCenter"),
          alignRight: t("editor.toolbar.alignRight"),
        }}
      />

      <BubbleMenu
        editor={editor}
        className="flex items-center overflow-hidden rounded-xl border border-slate-800 bg-[var(--color-text)] text-white shadow-2xl divide-x divide-slate-800"
      >
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleOpenCommentComposer()}
          disabled={
            !hasSelection ||
            (!usesCollaborativeBody && (hasPendingPersistence || isSaving)) ||
            (usesCollaborativeBody && collab.state !== "synced") ||
            isCreatingComment
          }
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageSquare size={12} />
          {t("editor.comment.comment")}
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleRewrite()}
          disabled={!hasSelection}
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={12} />
          {t("editor.ai.rewrite")}
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleDescribe("sight")}
          disabled={!hasSelection}
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search size={12} />
          {t("editor.ai.describe")}
        </button>
      </BubbleMenu>

      <div className="flex-1 overflow-y-auto bg-[var(--color-surface)] px-20 py-16 scroll-smooth">
        <div className="mx-auto max-w-3xl">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            readOnly={!canEdit}
            onChange={(event) => {
              const nextTitle = event.target.value;
              const chapterId = activeChapterIdRef.current;

              setTitle(nextTitle);
              setSaveError(null);

              if (!chapterId) return;

              const nextDraft = state.setActiveDraft({
                ...latestDraftRef.current,
                title: nextTitle,
              });
              if ((draftModesByChapterRef.current[chapterId] ?? "local") === "local") {
                state.storeLocalDraft(nextDraft);
              } else {
                state.storeLiveRecoveryDraft(nextDraft);
              }
              const { hasUnsaved } = state.syncSaveState(chapterId, nextTitle, lastEditorContentRef.current);
              state.scheduleAutosave(nextDraft, hasUnsaved);
            }}
            placeholder={t("editor.chapterTitle")}
            aria-label={t("editor.chapterTitle")}
            className={cn(
              "mb-10 w-full border-b border-[var(--color-border)] bg-transparent pb-4 text-4xl font-extrabold tracking-tight text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-border)] focus:border-[var(--color-text-muted)]",
              !canEdit && "cursor-default border-transparent pb-2 focus:border-transparent",
            )}
          />
          <EditorContent editor={editor} />
          {saveError && (
            <div className="mt-6 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--color-destructive)]">
              {saveError}
            </div>
          )}
          {collab.error && (
            <div className="mt-6 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--color-destructive)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{collab.error}</span>
                {state.canReconnectLiveCollaboration && (
                  <button
                    type="button"
                    onClick={state.triggerCollaborationReconnect}
                    className="rounded-xl border border-[var(--color-destructive)]/25 bg-white/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-destructive)] transition-colors hover:bg-white"
                  >
                    {t("editor.collaboration.reconnect")}
                  </button>
                )}
              </div>
            </div>
          )}
          {collabPersistenceWarning && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {collabPersistenceWarning}
            </div>
          )}
          {commentError && !pendingCommentDraft && (
            <div className="mt-6 rounded-2xl border border-[var(--color-accent-muted)] bg-[var(--color-accent-muted)] px-4 py-3 text-sm font-medium text-[var(--color-accent)]">
              {commentError}
            </div>
          )}
          {saveWarning && (
            <div className="mt-6 rounded-2xl border border-[var(--color-accent-muted)] bg-[var(--color-accent-muted)] px-4 py-3 text-sm font-medium text-[var(--color-accent)]">
              {saveWarning}
            </div>
          )}
          {saveConflict && (
            <div className="mt-6 rounded-2xl border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-[var(--color-destructive)]">
                    {t("editor.conflict.title")}
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {t("editor.conflict.description")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyConflictText}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
                  >
                    {t("editor.conflict.copyText")}
                  </button>
                  <button
                    type="button"
                    onClick={handleReloadLatest}
                    className="rounded-xl border border-[var(--color-destructive)]/25 bg-[var(--color-destructive)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--color-destructive)]/90"
                  >
                    {t("editor.conflict.reloadLatest")}
                  </button>
                </div>
              </div>
            </div>
          )}
          {isLocalEditingFallback && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              <div>{t("editor.collaboration.localFallback")}</div>
              {localFallbackDetail && (
                <div className="mt-2 break-all font-mono text-xs font-semibold text-amber-950/80">
                  {localFallbackDetail}
                </div>
              )}
            </div>
          )}
          {recoveredUnsavedChanges && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 animate-fade-in shadow-sm">
              <span>{t("editor.recoveredUnsavedChanges")}</span>
              <button
                type="button"
                onClick={() => setRecoveredUnsavedChanges(false)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 bg-transparent border-0 cursor-pointer ml-3 px-2 py-1 rounded hover:bg-amber-100/50 transition-all"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-[var(--color-border)] bg-[var(--background)] px-20 py-2">
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {t("editor.wordCount", { count: editor.storage.characterCount?.words?.() ?? 0 })}
        </span>
        <span className="text-[var(--color-border)]">·</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {t("editor.charCount", { count: editor.storage.characterCount?.characters?.() ?? 0 })}
        </span>
      </div>

      <PublicVoiceReader
        projectId={project?.metadata.id ?? currentChapter.projectId}
        chapterId={currentChapter.id}
        chapterTitle={voiceReaderTitle}
        chapterContent={voiceReaderContent}
        orderedBranchChapters={orderedBranchChapters}
        isLoading={isLoadingContent}
      />

      <Dialog.Root open={pendingCommentDraft != null} onOpenChange={(open) => {
        if (!open) {
          setPendingCommentDraft(null);
          setCommentError(null);
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/30 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-[32px] bg-[var(--color-surface)] p-8 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("editor.comment.new")}</p>
                  <Dialog.Title className="mt-2 text-2xl font-bold text-[var(--color-text)]">{t("editor.comment.discussPassage")}</Dialog.Title>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingCommentDraft(null);
                    setCommentError(null);
                  }}
                  className="rounded-xl p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]"
                  aria-label={t("editor.comment.close")}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 rounded-2xl bg-[var(--color-canvas)] px-4 py-4 text-sm font-medium leading-relaxed text-[var(--color-text)]">
                {"“" + (pendingCommentDraft?.selectedText ?? "") + "”"}
              </div>

              <div className="mt-5">
                <label htmlFor="comment-draft" className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                  {t("editor.comment.label")}
                </label>
                <textarea
                  id="comment-draft"
                  value={pendingCommentDraft?.content ?? ""}
                  onChange={(event) =>
                    setPendingCommentDraft((draft) => (draft ? { ...draft, content: event.target.value } : draft))
                  }
                  placeholder={t("editor.comment.placeholder")}
                  className="mt-2 min-h-[150px] w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--color-text-muted)]"
                />
              </div>

              {commentError && (
                <div className="mt-4 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--color-destructive)]">
                  {commentError}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {t("editor.comment.hint")}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingCommentDraft(null);
                      setCommentError(null);
                    }}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
                  >
                    {t("editor.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateComment()}
                    disabled={isCreatingComment || !(pendingCommentDraft?.content.trim())}
                    className="rounded-2xl bg-[var(--color-text)] px-4 py-2 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingComment ? t("editor.comment.posting") : t("editor.comment.post")}
                  </button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
