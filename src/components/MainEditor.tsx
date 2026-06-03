"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import CharacterCount from "@tiptap/extension-character-count";
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Wand2,
  Sparkles,
  MessageSquare,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Zap,
  Globe,
  Search,
  Download,
  History,
  Save,
  X,
  Maximize2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { rewriteAction, describeAction } from "@/actions/ai";
import { exportProjectAction } from "@/actions/export";
import { createCommentThread, getChapterContent, updateChapter } from "@/actions/projects";
import { AiGenerated } from "@/lib/tiptap/AiGenerated";
import { CommentAnchor } from "@/lib/tiptap/CommentAnchor";
import { cn } from "@/lib/utils";
import { PublicVoiceReader } from "@/components/PublicVoiceReader";
import { resolvePromptLanguage, type PromptLanguage } from "@/services/promptLanguageService";
import { useProjectStore } from "@/store/useProjectStore";
import { useZenStore } from "@/store/useZenStore";

type SaveReason = "manual" | "autosave" | "blur" | "switch" | "unmount";

type SaveRequest = {
  createVersion: boolean;
  reason: SaveReason;
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
    reason: current.createVersion || next.createVersion ? "manual" : next.reason,
    draft: next.draft ?? current.draft,
  };
}

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
  const setChapterContent = useProjectStore((state) => state.setChapterContent);
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

  const activeChapterIdRef = useRef<string | null>(null);
  const lastEditorContentRef = useRef("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const latestDraftRef = useRef<DraftSnapshot>(createEmptyDraftSnapshot());
  const draftsByChapterIdRef = useRef<Record<string, DraftSnapshot>>({});
  const persistedSnapshotsRef = useRef<Record<string, ChapterSnapshot>>({});
  const checkpointSnapshotsRef = useRef<Record<string, ChapterSnapshot>>({});
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<SaveRequest[]>([]);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const requestSaveRef = useRef<(request: SaveRequest) => void>(() => undefined);
  const canEditRef = useRef(canEdit);
  const canCollaborateRef = useRef(canCollaborate);
  const isLoadingContentRef = useRef(isLoadingContent);
  const isMountedRef = useRef(true);
  const suppressAutosaveRef = useRef(false);
  const presenceStateRef = useRef<"viewing" | "editing">("viewing");
  const presenceIntervalRef = useRef<number | null>(null);
  const collaborationProjectIdRef = useRef<string | null>(project?.metadata.id ?? null);

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

  const clearAutosaveTimer = () => {
    if (autosaveTimeoutRef.current === null) return;
    window.clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = null;
  };

  const syncSaveState = (chapterId: string, nextTitle: string, nextContent: string) => {
    const persisted = persistedSnapshotsRef.current[chapterId];
    const checkpoint = checkpointSnapshotsRef.current[chapterId];
    const hasUnsaved = hasSnapshotChanges(persisted, { title: nextTitle, content: nextContent });
    const checkpointBaseline = checkpoint?.content ?? persisted?.content ?? nextContent;
    const checkpointDirty = checkpointBaseline !== nextContent;

    if (isMountedRef.current && activeChapterIdRef.current === chapterId) {
      setHasUnsavedChanges(hasUnsaved);
      setHasCheckpointChanges(checkpointDirty);
    }

    return { hasUnsaved, checkpointDirty };
  };

  const persistDraft = async (request: SaveRequest) => {
    const draft = request.draft ?? createDraftSnapshot();
    if (!draft.projectId || !draft.chapterId) return;

    const { hasUnsaved, checkpointDirty } = syncSaveState(draft.chapterId, draft.title, draft.content);
    const shouldCreateVersion = request.createVersion && checkpointDirty;
    const shouldSave = request.createVersion ? true : hasUnsaved;
    const shouldSurfaceStatus = request.reason !== "switch" && request.reason !== "unmount";

    if (!shouldSave) return;

    if (isMountedRef.current && shouldSurfaceStatus && activeChapterIdRef.current === draft.chapterId) {
      setIsSaving(true);
      setSaveError(null);
      setSaveWarning(null);
    }

    try {
      const result = await updateChapter(draft.projectId, draft.chapterId, {
        title: draft.title,
        content: draft.content,
        createVersion: request.createVersion,
        revalidate: request.reason === "manual",
      });

      setStoredDraft(draft);
      persistedSnapshotsRef.current[draft.chapterId] = toChapterSnapshot(draft);

      const projectState = useProjectStore.getState();
      if (projectState.chapterContentCache[draft.chapterId] !== draft.content) {
        setChapterContent(draft.chapterId, draft.content);
      }

      const savedChapter = projectState.project?.chapters.find((chapter) => chapter.id === draft.chapterId);
      if (savedChapter?.title !== draft.title) {
        updateChapterMetaLocally(draft.chapterId, { title: draft.title });
      }

      if (shouldCreateVersion) {
        checkpointSnapshotsRef.current[draft.chapterId] = toChapterSnapshot(draft);
      }

      const latestDraft = latestDraftRef.current.chapterId === draft.chapterId ? latestDraftRef.current : draft;
      syncSaveState(draft.chapterId, latestDraft.title, latestDraft.content);

      if (isMountedRef.current && shouldSurfaceStatus && activeChapterIdRef.current === draft.chapterId) {
        setSaveWarning(result.continuity.fresh || result.continuity.status === "queued" ? null : result.continuity.warning);
      }
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

  useEffect(() => {
    canEditRef.current = canEdit;
    canCollaborateRef.current = canCollaborate;
    isLoadingContentRef.current = isLoadingContent;
    collaborationProjectIdRef.current = project?.metadata.id ?? null;
    requestSaveRef.current = requestSave;
  });

  const scheduleAutosave = (draft: DraftSnapshot, hasUnsaved: boolean) => {
    clearAutosaveTimer();
    if (!canEditRef.current || isLoadingContentRef.current || !hasUnsaved) return;

    autosaveTimeoutRef.current = window.setTimeout(() => {
      requestSaveRef.current({ createVersion: false, reason: "autosave", draft });
    }, 2000);
  };

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

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure(),
      Underline,
      AiGenerated,
      CommentAnchor,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: canEdit ? t("editor.placeholder") : t("editor.emptyChapter"),
      }),
      CharacterCount.configure({ mode: "nodeSize" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none min-h-[500px] text-lg leading-relaxed text-[var(--color-text)]",
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
      if (canCollaborate) {
        updatePresenceState("viewing");
      }
      if (!canEdit || isLoadingContent) return;
      requestSave({ createVersion: false, reason: "blur" });
    },
    onSelectionUpdate: ({ editor: nextEditor }) => {
      setHasSelection(!nextEditor.state.selection.empty);
    },
    onUpdate: ({ editor: nextEditor }) => {
      const chapterId = activeChapterIdRef.current;
      if (!chapterId || isLoadingContent) return;

      const nextContent = nextEditor.getHTML();
      lastEditorContentRef.current = nextContent;
      const nextDraft = setActiveDraft({
        ...latestDraftRef.current,
        content: nextContent,
      });

      if (suppressAutosaveRef.current) {
        suppressAutosaveRef.current = false;
        return;
      }

      setSaveError(null);
      if (canCollaborate && canEdit) {
        updatePresenceState("editing");
      }
      const { hasUnsaved } = syncSaveState(chapterId, nextDraft.title, nextContent);
      scheduleAutosave(nextDraft, hasUnsaved);
    },
  });

  useEffect(() => {
    const persistedSnapshots = persistedSnapshotsRef.current;

    return () => {
      clearAutosaveTimer();
      isMountedRef.current = false;

      const draft = createDraftSnapshot();
      if (!draft.chapterId) return;
      if (!hasSnapshotChanges(persistedSnapshots[draft.chapterId], draft)) return;

      requestSaveEffect({ createVersion: false, reason: "unmount", draft });
    };
  }, []);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit && !isLoadingContent);
  }, [editor, canEdit, isLoadingContent]);

  useEffect(() => {
    if (!project?.metadata.id || !canCollaborate) return;

    presenceStateRef.current = "viewing";
    void postPresence({
      chapterId: selectedChapterId ?? null,
      state: "viewing",
    });
    startPresenceHeartbeat();

    return () => {
      leavePresence(true);
    };
  }, [project?.metadata.id, selectedChapterId, canCollaborate, postPresence, startPresenceHeartbeat, leavePresence]);

  useEffect(() => {
    if (!canCollaborate) return;

    const handlePageHide = () => {
      leavePresence(true);
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [canCollaborate, leavePresence]);

  useEffect(() => {
    if (!editor) return;

    const activeElements = Array.from(
      editor.view.dom.querySelectorAll<HTMLElement>("[data-comment-thread-active='true']")
    );
    activeElements.forEach((element) => {
      element.removeAttribute("data-comment-thread-active");
    });

    if (!selectedCommentThreadId) return;

    const anchors = Array.from(
      editor.view.dom.querySelectorAll<HTMLElement>(`[data-comment-thread-id="${selectedCommentThreadId}"]`)
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
    if (!editor) return;

    if (!selectedChapterId || !currentChapter?.id) {
      activeChapterIdRef.current = null;
      lastEditorContentRef.current = "";
      latestDraftRef.current = createEmptyDraftSnapshot();
      clearAutosaveTimer();

      if (editor.getHTML() !== "") {
        editor.commands.setContent("", { emitUpdate: false });
      }

      return;
    }

    const projectId = project?.metadata.id;
    if (!projectId) return;

    let cancelled = false;
    const previousChapterId = activeChapterIdRef.current;
    const previousChapterStillExists = previousChapterId
      ? project?.chapters.some((chapter) => chapter.id === previousChapterId)
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

      const persistedBaseline =
        source === "local"
          ? persistedSnapshotsRef.current[draft.chapterId] ?? toChapterSnapshot({
            title: currentChapter?.title || draft.title,
            content: currentCachedContent ?? draft.content,
          })
          : toChapterSnapshot(draft);

      activeChapterIdRef.current = draft.chapterId;
      lastEditorContentRef.current = draft.content;
      setActiveDraft(draft);

      if (!persistedSnapshotsRef.current[draft.chapterId] || source !== "local") {
        persistedSnapshotsRef.current[draft.chapterId] = persistedBaseline;
      }

      if (!checkpointSnapshotsRef.current[draft.chapterId]) {
        checkpointSnapshotsRef.current[draft.chapterId] = persistedBaseline;
      }

      clearAutosaveTimer();
      setTitle(draft.title);
      setSaveError(null);
      setSaveWarning(null);
      setIsLoadingContent(false);
      setHasSelection(false);

      if (editor.getHTML() !== draft.content) {
        editor.commands.setContent(draft.content || "", { emitUpdate: false });
      }

      syncSaveState(draft.chapterId, draft.title, draft.content);
    };

    if (previousChapterId !== selectedChapterId) {
      const localDraft = draftsByChapterIdRef.current[selectedChapterId];
      if (localDraft) {
        loadChapter({ ...localDraft, projectId, chapterId: selectedChapterId }, "local");
        return () => {
          cancelled = true;
        };
      }

      const nextTitle = currentChapter?.title || "";

      if (currentCachedContent !== undefined) {
        loadChapter({
          projectId,
          chapterId: selectedChapterId,
          title: nextTitle,
          content: currentCachedContent,
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
      editor.commands.setContent(`<p class='text-[var(--color-text-muted)] italic'>${t("editor.loading")}</p>`, { emitUpdate: false });

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
    }

    if (currentCachedContent !== undefined && currentCachedContent !== lastEditorContentRef.current) {
      const nextDraft = {
        projectId,
        chapterId: selectedChapterId,
        title: currentChapter?.title || "",
        content: currentCachedContent,
      };

      lastEditorContentRef.current = currentCachedContent;
      setStoredDraft(nextDraft);
      persistedSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(nextDraft);
      checkpointSnapshotsRef.current[selectedChapterId] = toChapterSnapshot(nextDraft);

      clearAutosaveTimer();
      setTitle(nextDraft.title);
      setHasSelection(false);

      if (editor.getHTML() !== currentCachedContent) {
        editor.commands.setContent(currentCachedContent || "", { emitUpdate: false });
      }

      setSaveError(null);
      setSaveWarning(null);
      syncSaveState(selectedChapterId, nextDraft.title, currentCachedContent);
    }

    return () => {
      cancelled = true;
    };
  }, [
    editor,
    project?.chapters,
    selectedChapterId,
    project?.metadata.id,
    currentChapter?.id,
    currentChapter?.title,
    currentCachedContent,
    setChapterContent,
    t,
  ]);

  useEffect(() => {
    if (editor && pendingInsertion) {
      editor.chain().focus().insertContent(pendingInsertion).setAiGenerated().run();
      clearPendingInsertion();
    }
  }, [editor, pendingInsertion, clearPendingInsertion]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedDrafts = Object.values(draftsByChapterIdRef.current).some((draft) =>
        hasSnapshotChanges(persistedSnapshotsRef.current[draft.chapterId], draft)
      );
      if (!hasUnsavedDrafts) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleOpenCommentComposer = () => {
    if (!editor || !currentChapter) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
    if (!selectedText) return;

    if (hasUnsavedChanges || hasCheckpointChanges || isSaving) {
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
      suppressAutosaveRef.current = true;
      editor
        .chain()
        .setTextSelection({ from: pendingCommentDraft.from, to: pendingCommentDraft.to })
        .setCommentAnchor({ threadId: pendingCommentDraft.threadId })
        .run();

      const anchoredContent = editor.getHTML();
      lastEditorContentRef.current = anchoredContent;
      const storedDraft = setStoredDraft({
        ...latestDraftRef.current,
        content: anchoredContent,
      });

      const thread = await createCommentThread(project.metadata.id, {
        threadId: pendingCommentDraft.threadId,
        chapterId,
        selectedText: pendingCommentDraft.selectedText,
        content,
        chapterContent: anchoredContent,
      });

      const baseline = toChapterSnapshot(storedDraft);
      persistedSnapshotsRef.current[chapterId] = baseline;
      checkpointSnapshotsRef.current[chapterId] = baseline;
      setChapterContent(chapterId, anchoredContent);
      syncSaveState(chapterId, storedDraft.title, anchoredContent);
      upsertCommentThread(thread);
      setSelectedCommentThreadId(thread.id);
      setPendingCommentDraft(null);
    } catch (error) {
      editor.commands.setContent(originalContent, { emitUpdate: false });
      lastEditorContentRef.current = originalContent;
      const restoredDraft = setStoredDraft({
        ...latestDraftRef.current,
        content: originalContent,
      });
      syncSaveState(chapterId, restoredDraft.title, originalContent);
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

  const handleKeyboardShortcuts = useEffectEvent((event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (!modifier || !editor || !project) return;

    if (!canEdit || isGenerating) return;

    if (event.key === "s") {
      event.preventDefault();
      handleManualSave();
      return;
    }

    if (!event.shiftKey) return;

    if (event.key === "W" || event.key === "w") {
      event.preventDefault();
      void handleWrite();
    }
    if (event.key === "R" || event.key === "r") {
      event.preventDefault();
      void handleRewrite();
    }
    if (event.key === "D" || event.key === "d") {
      event.preventDefault();
      void handleDescribe();
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

  if (!canEdit && !canCollaborate) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-canvas)] relative">
        <div className="border-b border-[var(--color-border)]/50 bg-[var(--color-canvas)] px-6 py-4">
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
        </div>

        <div className="flex-1 overflow-y-auto px-20 py-20 pb-40 scroll-smooth bg-[var(--color-canvas)]">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-5xl font-extrabold text-[var(--color-text)] mb-12 tracking-tight leading-tight">
              {currentChapter?.title || t("editor.untitledChapter")}
            </h1>
            <div className="prose prose-slate max-w-none text-xl leading-relaxed text-[var(--color-text)]">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        <PublicVoiceReader
          projectId={project?.metadata.id ?? currentChapter.projectId}
          chapterId={currentChapter.id}
          chapterTitle={currentChapter.title || t("editor.untitledChapter")}
          chapterContent={currentCachedContent ?? ""}
          isLoading={isLoadingContent}
        />
      </div>
    );
  }

  const isCommentOnly = Boolean(canCollaborate && !canEdit);
  const canManualSave = Boolean(selectedChapterId) && !isLoadingContent && canEdit;

  return (
    <div className="flex flex-col h-full bg-[var(--color-canvas)]">
      <div className="flex items-center gap-2 px-6 py-2 border-b border-[var(--color-border)]/50 bg-[var(--color-canvas)]">
        <div className="flex items-center gap-1 bg-[var(--color-canvas)] rounded-xl p-1">
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => void handleWrite()}
                  disabled={isGenerating || !canEdit}
                  className="flex cursor-pointer items-center gap-2 px-4 py-1.5 bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg text-sm font-bold shadow-sm border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 size={16} className="text-[var(--color-accent)]" />
                  {t("editor.ai.write")}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
                  sideOffset={5}
                >
                  {t("editor.ai.writeShortcut")}
                  <Tooltip.Arrow className="fill-[var(--color-text)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleRewrite()}
                  disabled={isGenerating || !hasSelection || !canEdit}
                  className="flex cursor-pointer items-center gap-2 px-4 py-1.5 text-[var(--color-text-secondary)] rounded-lg text-sm font-bold hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={16} className="text-[var(--color-accent)]" />
                  {t("editor.ai.rewrite")}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
                  sideOffset={5}
                >
                  {t("editor.ai.rewriteShortcut")}
                  <Tooltip.Arrow className="fill-[var(--color-text)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleDescribe()}
                  disabled={isGenerating || !hasSelection || !canEdit}
                  className="flex cursor-pointer items-center gap-2 px-4 py-1.5 text-[var(--color-text-secondary)] rounded-lg text-sm font-bold hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MessageSquare size={16} className="text-[var(--color-accent)]" />
                  {t("editor.ai.describe")}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
                  sideOffset={5}
                >
                  {t("editor.ai.describeShortcut")}
                  <Tooltip.Arrow className="fill-[var(--color-text)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => void handleBrainstorm()}
                  disabled={isGenerating || !canEdit}
                  className="flex cursor-pointer items-center gap-2 px-4 py-1.5 text-[var(--color-text-secondary)] rounded-lg text-sm font-bold hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap size={16} className="text-[var(--color-accent)]" />
                  {t("editor.ai.brainstorm")}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
                  sideOffset={5}
                >
                  {t("editor.ai.brainstormShortcut")}
                  <Tooltip.Arrow className="fill-[var(--color-text)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {isCommentOnly && (
            <div className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-700">
              {t("editor.comment.commentingMode")}
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
            <div
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                saveError
                  ? "bg-[var(--color-destructive)]"
                  : isSaving
                    ? "bg-[var(--color-accent)]/60 animate-pulse"
                    : saveWarning
                      ? "bg-[var(--color-accent)]"
                      : hasUnsavedChanges || hasCheckpointChanges
                        ? "bg-[var(--color-text-muted)]"
                        : "bg-[var(--color-success)]",
              )}
            />
            {saveError
              ? t("editor.status.saveFailed")
              : isSaving
                ? t("editor.status.saving")
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
              className="cursor-pointer p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
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
            title="Export project as Markdown"
            disabled={isExporting}
            className="cursor-pointer p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
          </button>
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={toggleZen}
                  className="cursor-pointer p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
                  aria-label="Enter zen mode"
                >
                  <Maximize2 size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="rounded-lg bg-[var(--color-text)] px-3 py-2 text-xs text-[var(--color-canvas)] shadow-lg"
                  sideOffset={5}
                >
                  Enter zen mode
                  <Tooltip.Arrow className="fill-[var(--color-text)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} disabled={!canEdit}>
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} disabled={!canEdit}>
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} disabled={!canEdit}>
            <UnderlineIcon size={16} />
          </ToolbarButton>
        </div>
        <div className="w-px h-4 bg-[var(--color-border)]" />
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} disabled={!canEdit}>
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} disabled={!canEdit}>
            <ListOrdered size={16} />
          </ToolbarButton>
        </div>
        <div className="w-px h-4 bg-[var(--color-border)]" />
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} disabled={!canEdit}>
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} disabled={!canEdit}>
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} disabled={!canEdit}>
            <AlignRight size={16} />
          </ToolbarButton>
        </div>
      </div>

      <BubbleMenu
        editor={editor}
        className="flex items-center bg-[var(--color-text)] text-white rounded-xl shadow-2xl overflow-hidden divide-x divide-slate-800 border border-slate-800"
      >
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleOpenCommentComposer()}
          disabled={!hasSelection || hasUnsavedChanges || hasCheckpointChanges || isSaving || isCreatingComment}
          className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageSquare size={12} />
          {t("editor.comment.comment")}
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleRewrite()}
          disabled={!hasSelection}
          className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={12} />
          {t("editor.ai.rewrite")}
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleDescribe("sight")}
          disabled={!hasSelection}
          className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-colors flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search size={12} />
          {t("editor.ai.describe")}
        </button>
      </BubbleMenu>

      <div className="flex-1 overflow-y-auto px-20 py-16 scroll-smooth bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
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
              const { hasUnsaved } = syncSaveState(chapterId, nextTitle, lastEditorContentRef.current);
              scheduleAutosave(nextDraft, hasUnsaved);
            }}
            placeholder={t("editor.chapterTitle")}
            aria-label={t("editor.chapterTitle")}
            className={cn(
              "w-full text-4xl font-extrabold text-[var(--color-text)] bg-transparent border-b border-[var(--color-border)] outline-none mb-10 pb-4 placeholder:text-[var(--color-border)] tracking-tight transition-colors focus:border-[var(--color-text-muted)]",
              !canEdit && "cursor-default border-transparent pb-2 focus:border-transparent",
            )}
          />
          <EditorContent editor={editor} />
          {saveError && (
            <div className="mt-6 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--color-destructive)]">
              {saveError}
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
        </div>
      </div>

      <div className="flex items-center gap-4 px-20 py-2 border-t border-[var(--color-border)] bg-[var(--background)]">
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {t("editor.wordCount", { count: editor.storage.characterCount?.words?.() ?? 0 })}
        </span>
        <span className="text-[var(--color-border)]">·</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {t("editor.charCount", { count: editor.storage.characterCount?.characters?.() ?? 0 })}
        </span>
      </div>
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
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "cursor-pointer p-1.5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-45",
        active ? "bg-[var(--color-text)] text-white shadow-md" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]",
      )}
    >
      {children}
    </button>
  );
}
