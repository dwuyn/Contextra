"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { HocuspocusProvider } from "@hocuspocus/provider";
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
import { createCommentThread, getChapterContent, saveCollaborativeChapter, updateChapter } from "@/actions/projects";
import { shouldUseProjectLiveCollaboration } from "@/lib/collaboration/config";
import { createChapterEditorExtensions } from "@/lib/tiptap/chapterEditorExtensions";
import { cn } from "@/lib/utils";
import { EditorFormattingToolbar } from "@/components/EditorFormattingToolbar";
import { ChapterIllustrationPage } from "@/components/ChapterIllustrationPage";
import { PublicVoiceReader } from "@/components/PublicVoiceReader";
import {
  canFinalizeLiveCollaborationSync,
  getPreferredDraftContent,
  getPreservedEditorContent,
  getEditorTransportKey,
  resolveLiveCollaborationChapterId,
  shouldApplyLocalEditorContent,
  shouldFlushLiveCollaborativeContent,
  shouldPreservePreviousEditorContent,
  shouldPublishSavedTitle,
  type DraftPersistenceReason,
  type DraftMode,
} from "@/components/mainEditorCollaboration";
import { resolvePromptLanguage, type PromptLanguage } from "@/services/promptLanguageService";
import { useProjectStore } from "@/store/useProjectStore";
import { useZenStore } from "@/store/useZenStore";
import type { ChapterIllustrationMeta, ProjectCollaborationSession } from "@/types/project";

type SaveReason = DraftPersistenceReason;

type SaveRequest = {
  createVersion: boolean;
  reason: SaveReason;
  flushCollaborativeContent?: boolean;
  draft?: DraftSnapshot;
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

function mergeSaveRequests(current: SaveRequest | null, next: SaveRequest): SaveRequest {
  if (!current) return next;

  return {
    createVersion: current.createVersion || next.createVersion,
    flushCollaborativeContent: current.flushCollaborativeContent || next.flushCollaborativeContent,
    reason: current.createVersion || next.createVersion ? "manual" : next.reason,
    draft: next.draft ?? current.draft,
  };
}

const COLLABORATION_RETRY_DELAY_MS = 1500;
const COLLABORATION_MAX_RETRIES = 3;
const COLLABORATION_INITIAL_SYNC_TIMEOUT_MS = 4_000;
const COLLABORATIVE_CONTENT_FLUSH_INTERVAL_MS = 30_000;

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

export function MainEditor({
  onToggleHistory,
  onOpenAiHistory,
}: {
  onToggleHistory?: () => void;
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
  const canEdit = !!project?.viewerAccess?.canEdit;
  const canCollaborate = !!project && !project.viewerAccess?.isPublicViewer;
  const { toggleZen } = useZenStore();
  const t = useTranslations();

  const [title, setTitle] = useState(currentChapter?.title || "");
  const [collaborationDisabledChapterId, setCollaborationDisabledChapterId] = useState<string | null>(null);
  const [liveCollaborationChapterId, setLiveCollaborationChapterId] = useState<string | null>(null);
  const [collaborationRetryNonce, setCollaborationRetryNonce] = useState(0);
  const [collab, setCollab] = useState<{
    session: ProjectCollaborationSession | null;
    provider: HocuspocusProvider | null;
    state: CollaborationState;
    error: string | null;
  }>({ session: null, provider: null, state: "idle", error: null });
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasCheckpointChanges, setHasCheckpointChanges] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
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
  const isLiveCollaborationRequested = shouldUseProjectLiveCollaboration(project, selectedChapterId);
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

  const hasPendingDraftChanges = useCallback((
    chapterId: string,
    draft: Pick<DraftSnapshot, "title" | "content">,
    mode: DraftMode = draftModesByChapterRef.current[chapterId] ?? "local",
  ) => {
    const persisted = persistedSnapshotsRef.current[chapterId];
    if (mode === "live") {
      return Boolean(persisted && persisted.title !== draft.title);
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

  const syncSaveState = useCallback((
    chapterId: string,
    nextTitle: string,
    nextContent: string,
    mode: DraftMode = draftModesByChapterRef.current[chapterId] ?? "local",
  ) => {
    const persisted = persistedSnapshotsRef.current[chapterId];
    const checkpoint = checkpointSnapshotsRef.current[chapterId];
    const hasUnsaved = hasPendingDraftChanges(
      chapterId,
      { title: nextTitle, content: nextContent },
      mode,
    );
    const checkpointBaseline = checkpoint?.content ?? persisted?.content ?? nextContent;
    const checkpointDirty = checkpointBaseline !== nextContent;

    if (isMountedRef.current && activeChapterIdRef.current === chapterId) {
      setHasUnsavedChanges(hasUnsaved);
      setHasCheckpointChanges(checkpointDirty);
    }

    return { hasUnsaved, checkpointDirty };
  }, [hasPendingDraftChanges]);

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
    }
  }, [project?.metadata.id, setChapterContent, storeLocalDraft]);

  const resetCollaborationState = useCallback(() => {
    clearCollaborativeFlushTimer();
    clearCollaborationRetryTimer();
    clearCollaborationSyncTimeout();
    clearCollaborationReadyFrame();
    collaborationProviderSyncedRef.current = false;
    collaborationEditorRenderedRef.current = false;
    setCollab({ session: null, provider: null, state: "idle", error: null });
    collaborationHasSyncedRef.current = false;
    collaborationRetryCountRef.current = 0;
  }, [clearCollaborativeFlushTimer, clearCollaborationReadyFrame, clearCollaborationRetryTimer, clearCollaborationSyncTimeout]);

  const finalizeLiveCollaborationSync = useCallback(() => {
    if (!canFinalizeLiveCollaborationSync({
      providerSynced: collaborationProviderSyncedRef.current,
      editorRendered: collaborationEditorRenderedRef.current,
    })) {
      console.log("[collab] finalizeLiveCollaborationSync - not ready yet", {
        providerSynced: collaborationProviderSyncedRef.current,
        editorRendered: collaborationEditorRenderedRef.current,
      });
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

      console.log("[collab] finalizeLiveCollaborationSync - synced!");
      setCollab((prev) => ({ ...prev, state: "synced", error: null }));
      clearCollaborationSyncTimeout();
      setIsLoadingContent(false);
    });
  }, [clearCollaborationReadyFrame, clearCollaborationSyncTimeout]);

  const handleCollaborationFirstRender = useCallback(() => {
    console.log("[collab] handleCollaborationFirstRender - providerSynced:", collaborationProviderSyncedRef.current);
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

  const recoverCollaborativeDraftLocally = useCallback((chapterId: string | null) => {
    if (!chapterId) {
      return;
    }

    clearCollaborativeFlushTimer();
    clearCollaborationReadyFrame();
    collaborationHasSyncedRef.current = false;
    collaborationProviderSyncedRef.current = false;
    collaborationEditorRenderedRef.current = false;
    draftModesByChapterRef.current[chapterId] = "local";
    collaborationModeRef.current = "local";

    const recoveredDraft = draftsByChapterIdRef.current[chapterId]
      ?? (latestDraftRef.current.chapterId === chapterId ? latestDraftRef.current : null);
    if (recoveredDraft) {
      lastEditorContentRef.current = recoveredDraft.content;
      collaborationExpectedContentRef.current = recoveredDraft.content;
      setChapterContent(chapterId, recoveredDraft.content);
      setStoredDraft(recoveredDraft);
      storeLocalDraft(recoveredDraft);
      syncSaveState(chapterId, recoveredDraft.title, recoveredDraft.content, "local");
    }

    setIsLoadingContent(false);
  }, [clearCollaborativeFlushTimer, clearCollaborationReadyFrame, setChapterContent, storeLocalDraft, syncSaveState]);

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

  const fallbackToLocalEditing = useCallback((chapterId: string | null, errorMessage: string) => {
    if (!chapterId) {
      return;
    }

    disableLiveCollaboration(chapterId);
    setCollab({
      session: null,
      provider: null,
      state: "error",
      error: errorMessage,
    });
  }, [disableLiveCollaboration]);

  const persistDraft = async (request: SaveRequest) => {
    const draft = request.draft ?? createDraftSnapshot();
    if (!draft.projectId || !draft.chapterId) return;

    const draftMode = draftModesByChapterRef.current[draft.chapterId] ?? "local";
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

    if (!shouldSave) return;

    if (isMountedRef.current && shouldSurfaceStatus && activeChapterIdRef.current === draft.chapterId) {
      setIsSaving(true);
      setSaveError(null);
      setSaveWarning(null);
    }

    try {
      const result = shouldFlushCollaborativeContent
        ? await saveCollaborativeChapter(draft.projectId, draft.chapterId, {
            title: draft.title,
            createVersion: shouldCreateVersion,
            revalidate: request.reason === "manual" || shouldCreateVersion,
          })
        : await updateChapter(draft.projectId, draft.chapterId, {
            title: draft.title,
            content: isCollaborativeDraft ? undefined : draft.content,
            createVersion: isCollaborativeDraft ? undefined : request.createVersion,
            revalidate: request.reason === "manual",
          });

      persistedSnapshotsRef.current[draft.chapterId] = toChapterSnapshot(draft);
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
      }

      const projectState = useProjectStore.getState();
      const savedChapter = projectState.project?.chapters.find((chapter) => chapter.id === draft.chapterId);
      if (
        shouldPublishSavedTitle({
          savedTitle: draft.title,
          latestTitle: latestDraft.title,
        }) &&
        savedChapter?.title !== draft.title
      ) {
        updateChapterMetaLocally(draft.chapterId, { title: draft.title });
      }

      if (shouldCreateVersion) {
        checkpointSnapshotsRef.current[draft.chapterId] = toChapterSnapshot(draft);
      }

      syncSaveState(draft.chapterId, latestDraft.title, latestDraft.content, draftMode);

      if (isMountedRef.current && shouldSurfaceStatus && activeChapterIdRef.current === draft.chapterId) {
        const continuityWarning =
          result.continuity.fresh || result.continuity.status === "queued"
            ? null
            : result.continuity.warning;
        const nextWarning = [continuityWarning, result.collaborationWarning]
          .filter((warning): warning is string => Boolean(warning))
          .join(" ");

        setSaveWarning(nextWarning || null);
      }
    } catch (error) {
      // If collaborative flush fails, save content locally as fallback
      if (isCollaborativeDraft && draft.content) {
        console.warn("[collab] Flush failed, saving locally as fallback:", error);
        try {
          await updateChapter(draft.projectId, draft.chapterId, {
            title: draft.title,
            content: draft.content,
            createVersion: false,
            revalidate: false,
          });
          // Mark as successfully saved locally
          persistedSnapshotsRef.current[draft.chapterId] = toChapterSnapshot(draft);
          collaborativeFlushedContentRef.current[draft.chapterId] = draft.content;
        } catch (fallbackError) {
          console.error("[collab] Local fallback save also failed:", fallbackError);
        }
      }

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
    if (lastQueuedRequest?.draft?.chapterId === request.draft?.chapterId) {
      queuedSaveRef.current[queuedSaveRef.current.length - 1] = mergeSaveRequests(lastQueuedRequest, request);
      return;
    }

    queuedSaveRef.current.push(request);
  };

  const requestSave = (request: SaveRequest) => {
    const nextRequest = {
      ...request,
      draft: request.draft ?? createDraftSnapshot(),
    };
    if (!nextRequest.draft.projectId || !nextRequest.draft.chapterId) return;

    clearAutosaveTimer();
    const draftMode = draftModesByChapterRef.current[nextRequest.draft.chapterId] ?? "local";
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

    void persistDraft(nextRequest)
      .catch((error) => {
        console.error(`${nextRequest.reason} save failed:`, error);
      })
      .finally(() => {
        saveInFlightRef.current = false;

        const queuedRequest = queuedSaveRef.current.shift();
        if (queuedRequest) {
          requestSave(queuedRequest);
        }
      });
  };
  const requestSaveEffect = useEffectEvent((request: SaveRequest) => {
    requestSave(request);
  });
  const hasPendingDraftPersistence = useCallback((
    draft: Pick<DraftSnapshot, "chapterId" | "title" | "content">,
    mode: DraftMode,
  ) => (
    hasPendingDraftChanges(draft.chapterId, draft, mode)
    || (mode === "live" && hasPendingCollaborativeContentFlush(draft.chapterId, draft.content))
  ), [hasPendingCollaborativeContentFlush, hasPendingDraftChanges]);
  const handleUnmountSave = useEffectEvent(() => {
    const draft = createDraftSnapshot();
    if (!draft.chapterId) return;

    const draftMode = draftModesByChapterRef.current[draft.chapterId] ?? "local";
    const hasPendingSave = hasPendingDraftPersistence(draft, draftMode);
    if (!hasPendingSave) return;

    const savePromise = new Promise<void>((resolve) => {
      requestSaveEffect({
        createVersion: false,
        reason: "unmount",
        flushCollaborativeContent: draftMode === "live",
        draft,
      });
      // Give the save some time to complete, but don't block forever
      window.setTimeout(resolve, 2000);
    });

    pendingUnmountSaveRef.current = savePromise;
  });

  const waitForPendingSaves = useCallback(async () => {
    while (saveInFlightRef.current || queuedSaveRef.current.length > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }
  }, []);

  const flushLocalDraftForCollaboration = useEffectEvent(async () => {
    const draft = createDraftSnapshot();
    if (!draft.projectId || !draft.chapterId) {
      return;
    }

    const draftMode = draftModesByChapterRef.current[draft.chapterId] ?? "local";
    if (draftMode === "live") {
      return;
    }

    if (!hasPendingDraftPersistence(draft, draftMode)) {
      return;
    }

    await waitForPendingSaves();
    await persistDraft({
      createVersion: false,
      reason: "switch",
      draft,
    });
  });

  const triggerCollaborationReconnect = useCallback(() => {
    if (!selectedChapterId) {
      return;
    }

    clearCollaborationRetryTimer();
    clearCollaborationSyncTimeout();
    clearCollaborationReadyFrame();
    setCollaborationDisabledChapterId(null);
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
    setCollaborationRetryNonce((value) => value + 1);
  }, [clearCollaborationReadyFrame, clearCollaborationRetryTimer, clearCollaborationSyncTimeout, selectedChapterId]);

  const scheduleCollaborationReconnect = useCallback((options?: { recoverLocally?: boolean }) => {
    if (!selectedChapterId) {
      return;
    }

    clearCollaborationRetryTimer();
    clearCollaborationSyncTimeout();
    clearCollaborationReadyFrame();
    collaborationHasSyncedRef.current = false;
    collaborationProviderSyncedRef.current = false;
    collaborationEditorRenderedRef.current = false;

    const recoverLocally = options?.recoverLocally ?? false;

    if (collaborationRetryCountRef.current >= COLLABORATION_MAX_RETRIES) {
      recoverCollaborativeDraftLocally(selectedChapterId);
      setCollab((prev) => ({
        ...prev,
        session: null,
        provider: null,
        state: "error",
        error: t("editor.collaboration.reconnectExhausted"),
      }));
      return;
    }

    collaborationRetryCountRef.current += 1;
    if (recoverLocally) {
      recoverCollaborativeDraftLocally(selectedChapterId);
    }
    setCollab((prev) => ({
      ...prev,
      session: null,
      provider: null,
      state: "disconnected",
      error: t("editor.collaboration.reconnecting"),
    }));

    collaborationRetryTimeoutRef.current = window.setTimeout(() => {
      setCollab((prev) => ({
        ...prev,
        session: null,
        provider: null,
        state: "connecting",
        error: null,
      }));
      setCollaborationRetryNonce((value) => value + 1);
    }, COLLABORATION_RETRY_DELAY_MS);
  }, [
    clearCollaborationReadyFrame,
    clearCollaborationRetryTimer,
    clearCollaborationSyncTimeout,
    recoverCollaborativeDraftLocally,
    selectedChapterId,
    t,
  ]);

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

    if (!usesCollaborativeBody || !project?.metadata.id || !selectedChapterId) {
      queueMicrotask(() => {
        if (active) {
          resetCollaborationState();
        }
      });
      return () => {
        active = false;
      };
    }

    const searchParams = new URLSearchParams({
      projectId: project.metadata.id,
      chapterId: selectedChapterId,
    });

    void (async () => {
      try {
        console.log("[collab] Starting session fetch", { chapterId: selectedChapterId, mode: collaborationModeRef.current });
        if (collaborationModeRef.current === "local") {
          await flushLocalDraftForCollaboration();
        }

        if (!active) return;

        queueMicrotask(() => {
          if (!active) return;
          collaborationHasSyncedRef.current = false;
          collaborationProviderSyncedRef.current = false;
          collaborationEditorRenderedRef.current = false;
          clearCollaborationReadyFrame();
          setCollab((prev) => ({
            ...prev,
            session: null,
            provider: null,
            state: "connecting",
            error: null,
          }));
          setIsLoadingContent(true);
        });

        const response = await fetch(`/api/collab/session?${searchParams.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const message = await response.text();
          throw Object.assign(new Error(message || "Failed to create collaboration session"), {
            status: response.status,
          });
        }

        const session = await response.json() as ProjectCollaborationSession;
        console.log("[collab] Session fetched", { websocketUrl: session.websocketUrl, documentName: session.documentName });
        if (!active) return;
        setCollab((prev) => ({ ...prev, session }));
      } catch (error) {
        if (!active) return;
        console.error("[collab] Session fetch failed:", error);
        const status = typeof error === "object"
          && error
          && "status" in error
          && typeof error.status === "number"
          ? error.status
          : null;

        if (status === 401 || status === 403 || status === 404) {
          disableLiveCollaboration(selectedChapterId);
          return;
        }

        scheduleCollaborationReconnect({
          recoverLocally: collaborationHasSyncedRef.current,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [
    clearCollaborationReadyFrame,
    disableLiveCollaboration,
    project?.metadata.id,
    resetCollaborationState,
    scheduleCollaborationReconnect,
    selectedChapterId,
    usesCollaborativeBody,
    collaborationRetryNonce,
  ]);

  useEffect(() => {
    if (!collab.session) {
      return;
    }

    let active = true;
    collaborationProviderSyncedRef.current = false;
    collaborationEditorRenderedRef.current = false;
    clearCollaborationSyncTimeout();
    clearCollaborationReadyFrame();

    console.log("[collab] Creating HocuspocusProvider", {
      url: collab.session.websocketUrl,
      documentName: collab.session.documentName,
    });

    collaborationSyncTimeoutRef.current = window.setTimeout(() => {
      if (!active) {
        return;
      }

      const providerSynced = collaborationProviderSyncedRef.current;
      const editorRendered = collaborationEditorRenderedRef.current;

      if (canFinalizeLiveCollaborationSync({ providerSynced, editorRendered })) {
        return;
      }

      console.warn("[collab] Sync timeout - providerSynced:", providerSynced, "editorRendered:", editorRendered);
      fallbackToLocalEditing(selectedChapterId, t("editor.collaboration.syncTimedOut"));
    }, COLLABORATION_INITIAL_SYNC_TIMEOUT_MS);

    const provider = new HocuspocusProvider({
      url: collab.session.websocketUrl,
      name: collab.session.documentName,
      token: collab.session.token,
      onOpen: () => {
        console.log("[collab] Provider onOpen");
        setCollab((prev) => ({ ...prev, state: "connected" }));
      },
      onConnect: () => {
        console.log("[collab] Provider onConnect");
        setCollab((prev) => ({ ...prev, state: "connected" }));
      },
      onSynced: () => {
        console.log("[collab] Provider onSynced - editorRendered:", collaborationEditorRenderedRef.current);
        collaborationHasSyncedRef.current = true;
        collaborationProviderSyncedRef.current = true;
        clearCollaborationRetryTimer();
        collaborationRetryCountRef.current = 0;
        setCollab((prev) => ({ ...prev, state: "connected", error: null }));
        finalizeLiveCollaborationSync();
      },
      onDisconnect: () => {
        console.log("[collab] Provider onDisconnect - hasSynced:", collaborationHasSyncedRef.current);
        scheduleCollaborationReconnect({
          recoverLocally: collaborationHasSyncedRef.current,
        });
      },
      onClose: () => {
        console.log("[collab] Provider onClose - hasSynced:", collaborationHasSyncedRef.current);
        scheduleCollaborationReconnect({
          recoverLocally: collaborationHasSyncedRef.current,
        });
      },
      onAuthenticationFailed: ({ reason }: { reason: string }) => {
        console.error("[collab] Provider onAuthenticationFailed:", reason);
        scheduleCollaborationReconnect({
          recoverLocally: collaborationHasSyncedRef.current,
        });
      },
    });

    provider.awareness?.setLocalStateField("user", collab.session.user);
    queueMicrotask(() => {
      if (!active) return;
      setCollab((prev) => ({ ...prev, provider }));
    });

    return () => {
      active = false;
      clearCollaborationSyncTimeout();
      clearCollaborationReadyFrame();
      provider.destroy();
      setCollab((prev) => (prev.provider === provider ? { ...prev, provider: null } : prev));
    };
  }, [
    clearCollaborationSyncTimeout,
    clearCollaborationReadyFrame,
    clearCollaborationRetryTimer,
    collab.session,
    fallbackToLocalEditing,
    finalizeLiveCollaborationSync,
    scheduleCollaborationReconnect,
    selectedChapterId,
    t,
  ]);

  const scheduleAutosave = useCallback((draft: DraftSnapshot, hasUnsaved: boolean) => {
    clearAutosaveTimer();
    if (!canEditRef.current || isLoadingContentRef.current || !hasUnsaved) return;

    autosaveTimeoutRef.current = window.setTimeout(() => {
      requestSaveRef.current({ createVersion: false, reason: "autosave", draft });
    }, 2000);
  }, []);

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
    console.log("[collab] Transport key:", editorTransportKey, "collab.state:", collab.state);
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
      lastEditorContentRef.current = nextContent;
      setChapterContent(chapterId, nextContent);
      const nextDraft = setActiveDraft({
        ...latestDraftRef.current,
        content: nextContent,
      });
      if ((draftModesByChapterRef.current[chapterId] ?? "local") === "local") {
        storeLocalDraft(nextDraft);
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
    if (!editor) {
      return;
    }

    return () => {
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
      leavePresence(true);
    };
  }, [clearPresenceInterval, project?.metadata.id, selectedChapterId, canCollaborate, postPresence, startPresenceHeartbeat, leavePresence]);

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
    const previousChapterId = activeChapterIdRef.current;
    const previousChapterStillExists = previousChapterId
      ? useProjectStore.getState().project?.chapters.some((chapter) => chapter.id === previousChapterId)
      : false;

    if (previousChapterId && previousChapterId !== selectedChapterId && previousChapterStillExists) {
      requestSaveEffect({
        createVersion: false,
        reason: "switch",
        draft: createDraftSnapshot(),
      });
    }

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
        } else {
          clearChapterDraft(draft.chapterId);
        }
      } else {
        clearChapterDraft(draft.chapterId);
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
      setIsLoadingContent(false);
      setHasSelection(false);

      syncSaveState(draft.chapterId, draft.title, draft.content, "local");
    };

    if (previousChapterId === selectedChapterId) {
      return () => {
        cancelled = true;
      };
    }

    const storeState = useProjectStore.getState();
    const cachedDraft = storeState.chapterDraftCache[selectedChapterId];
    const localDraft = draftsByChapterIdRef.current[selectedChapterId] ?? (
      cachedDraft
        ? {
            projectId,
            chapterId: selectedChapterId,
            title: cachedDraft.title,
            content: cachedDraft.content,
          }
        : undefined
    );
    if (localDraft) {
      loadChapter({ ...localDraft, projectId, chapterId: selectedChapterId }, "local");
      return () => {
        cancelled = true;
      };
    }

    const nextTitle = currentChapterTitleRef.current || "";
    const cachedContent = storeState.chapterContentCache[selectedChapterId];

    if (cachedContent !== undefined) {
      loadChapter({
        projectId,
        chapterId: selectedChapterId,
        title: nextTitle,
        content: cachedContent,
      }, "cache");
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoadingContent(true);
      setSaveError(null);
      setSaveWarning(null);
    });

    getChapterContent(projectId, selectedChapterId)
      .then((content) => {
        if (cancelled) return;
        const nextContent = content || "";
        setChapterContent(selectedChapterId, nextContent);
        loadChapter({
          projectId,
          chapterId: selectedChapterId,
          title: nextTitle,
          content: nextContent,
        }, "server");
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setIsLoadingContent(false);
          setSaveError("Could not load this chapter. Try switching chapters or refreshing.");
          setSaveWarning(null);
        }
      });

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
      applyLocalEditorContent(
        selectedChapterId,
        `<p class='text-[var(--color-text-muted)] italic'>${t("editor.loading")}</p>`,
      );
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
    clearChapterDraft(selectedChapterId);
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
    loadCollaborativeDraft,
    project?.metadata.id,
    selectedChapterId,
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
      const chapterDraft = latestDraftRef.current.chapterId === selectedChapterId
        ? latestDraftRef.current
        : draftsByChapterIdRef.current[selectedChapterId];

      collaborationExpectedContentRef.current = syncedContent;
      lastEditorContentRef.current = syncedContent;
      setChapterContent(selectedChapterId, syncedContent);
      const syncedDraft = setStoredDraft({
        projectId: project.metadata.id,
        chapterId: selectedChapterId,
        title: chapterDraft?.title ?? currentChapterTitleRef.current,
        content: syncedContent,
      });
      clearChapterDraft(selectedChapterId);

      if (!persistedSnapshotsRef.current[selectedChapterId]) {
        persistedSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(syncedDraft);
      }
      if (!checkpointSnapshotsRef.current[selectedChapterId]) {
        checkpointSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(syncedDraft);
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

    if (!usesCollaborativeBody && (hasUnsavedChanges || hasCheckpointChanges || isSaving)) {
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
  if (!editor) return null;

  if (!currentChapter) {
    return (
      <div className="flex h-full flex-col bg-[var(--background)]">
        <div className="flex-1 px-20 py-20">
          <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
            <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/70 px-10 py-12 text-center shadow-sm">
              <h2 className="text-2xl font-bold text-[var(--color-text)]">{t("editor.noChapter.title")}</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t("editor.noChapter.description")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCommentOnly = Boolean(canCollaborate && !canEdit);
  const isLiveConnectionIssue = usesCollaborativeBody && (collab.state === "disconnected" || collab.state === "error");
  const isLiveConnecting = usesCollaborativeBody && !isLiveConnectionIssue && collab.state !== "idle" && collab.state !== "synced";
  const isLocalEditingFallback = isLiveCollaborationRequested && collaborationDisabledChapterId === currentChapter.id;
  const canReconnectLiveCollaboration = canEdit && isLiveCollaborationRequested && (
    isLocalEditingFallback ||
    collab.state === "disconnected" ||
    collab.state === "error"
  );
  const isIllustrationFlipped = flippedIllustrationChapterId === currentChapter.id;
  const isGeneratingIllustration = generatingIllustrationChapterId === currentChapter.id;
  const illustrationError = illustrationErrorsByChapter[currentChapter.id] ?? null;
  const canManualSave =
    Boolean(selectedChapterId) &&
    !isLoadingContent &&
    canEdit &&
    (!hasLiveTransport || collab.state === "synced");
  const selectedChapterDraft = project?.metadata.id
    ? getSelectedChapterDraftSnapshot(project.metadata.id)
    : null;
  const voiceReaderTitle = title || currentChapter.title || t("editor.untitledChapter");
  const voiceReaderContent = getPreferredDraftContent({
    draftContent: selectedChapterDraft?.content,
    cachedDraftContent: undefined,
    cachedContent: currentCachedContent,
    lastEditorContent: lastEditorContentRef.current,
  }) ?? "";
  const showIllustrationGenerationPanel = !project?.viewerAccess?.isPublicViewer;
  const illustration = currentChapter.illustration;
  const illustrationContent = editor.getHTML();

  const readOnlyEditorPage = (
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
        isLoading={isLoadingContent}
      />
    </div>
  );

  const editableEditorPage = (
    <div className="flex h-full flex-col bg-[var(--color-canvas)]">
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
                saveError || isLiveConnectionIssue
                  ? "bg-[var(--color-destructive)]"
                  : isSaving || isLiveConnecting
                    ? "animate-pulse bg-[var(--color-accent)]/60"
                    : saveWarning
                      ? "bg-[var(--color-accent)]"
                      : hasUnsavedChanges || hasCheckpointChanges
                        ? "bg-[var(--color-text-muted)]"
                        : "bg-[var(--color-success)]",
              )}
            />
            {saveError
              ? t("editor.status.saveFailed")
              : isLiveConnectionIssue
                ? t("editor.collaboration.liveOffline")
              : isSaving
                ? t("editor.status.saving")
                : isLiveConnecting
                  ? t("editor.collaboration.liveSyncing")
                : saveWarning
                  ? t("editor.status.memoryStale")
                  : hasUnsavedChanges || hasCheckpointChanges
                    ? t("editor.status.unsavedChanges")
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
            {isSaving ? t("editor.status.saving") : t("editor.save")}
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
                anchor.download = `${project.metadata.name.replace(/[^a-z0-9]/gi, "_")}.md`;
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
            (!usesCollaborativeBody && (hasUnsavedChanges || hasCheckpointChanges || isSaving)) ||
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

              const nextDraft = setActiveDraft({
                ...latestDraftRef.current,
                title: nextTitle,
              });
              if ((draftModesByChapterRef.current[chapterId] ?? "local") === "local") {
                storeLocalDraft(nextDraft);
              }
              const { hasUnsaved } = syncSaveState(chapterId, nextTitle, lastEditorContentRef.current);
              scheduleAutosave(nextDraft, hasUnsaved);
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
                {canReconnectLiveCollaboration && (
                  <button
                    type="button"
                    onClick={triggerCollaborationReconnect}
                    className="rounded-xl border border-[var(--color-destructive)]/25 bg-white/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-destructive)] transition-colors hover:bg-white"
                  >
                    {t("editor.collaboration.reconnect")}
                  </button>
                )}
              </div>
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
          {isLocalEditingFallback && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {t("editor.collaboration.localFallback")}
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
                “{pendingCommentDraft?.selectedText ?? ""}”
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

  const editorPage = !canEdit && !canCollaborate ? readOnlyEditorPage : editableEditorPage;

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
