import { create } from "zustand";
import type {
  ChapterIllustrationMeta,
  ChapterMeta,
  ProjectAiMessage,
  ProjectCommentThread,
  ProjectData,
  ProjectInvite,
  ProjectPresence,
} from "@/types/project";

export type AiHistoryCardStatus = "loading" | "ready" | "error";

export type AiHistoryCard = {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  status: AiHistoryCardStatus;
  errorMessage?: string;
};

type ChapterContentReplacement = {
  content: string;
  nonce: number;
};

export type ChapterDraftCache = {
  title: string;
  content: string;
  origin?: "local" | "live-recovery";
  savedAt?: number;
};

interface ProjectState {
  project: ProjectData | null;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  activeBranchId: string;
  isGenerating: boolean;
  isStoryBibleOpen: boolean;
  pendingTitleFocusChapterId: string | null;
  aiCards: AiHistoryCard[];
  pendingInsertion: string | null;
  chapterContentCache: Record<string, string>;
  chapterDraftCache: Record<string, ChapterDraftCache>;
  pendingChapterContentReplacements: Record<string, ChapterContentReplacement>;
  commentThreadsByChapter: Record<string, ProjectCommentThread[]>;
  selectedCommentThreadId: string | null;

  setProject: (project: ProjectData | null) => void;
  hydrateProject: (project: ProjectData) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedChapterId: (id: string | null) => void;
  setActiveBranchId: (id: string) => void;
  setIsGenerating: (is: boolean) => void;
  setIsStoryBibleOpen: (is: boolean) => void;
  requestTitleFocus: (chapterId: string) => void;
  clearPendingTitleFocus: () => void;
  createAiCard: (card: {
    type: string;
    content: string;
    status?: AiHistoryCardStatus;
    errorMessage?: string;
  }) => string;
  updateAiCard: (id: string, data: Partial<Pick<AiHistoryCard, "content" | "status" | "errorMessage">>) => void;
  removeAiCard: (id: string) => void;
  insertContent: (content: string) => void;
  clearPendingInsertion: () => void;
  updateChapterMetaLocally: (chapterId: string, data: {
    title?: string;
    summary?: string;
    illustration?: ChapterIllustrationMeta | null;
  }) => void;
  setChapterDraft: (chapterId: string, draft: ChapterDraftCache) => void;
  clearChapterDraft: (chapterId: string) => void;
  setChapterContent: (chapterId: string, content: string) => void;
  replaceChapterContent: (chapterId: string, content: string) => void;
  consumeChapterContentReplacement: (chapterId: string, nonce: number) => void;
  reorderChaptersLocally: (branchId: string, orderedIds: string[]) => void;
  appendProjectAiMessage: (message: ProjectAiMessage) => void;
  updateProjectAiMessage: (messageId: string, data: Partial<Pick<ProjectAiMessage, "content">>) => void;
  syncProjectInvite: (invite: ProjectInvite) => void;
  syncProjectPresence: (userId: string, presence: ProjectPresence | null) => void;
  setCommentThreads: (chapterId: string, threads: ProjectCommentThread[]) => void;
  upsertCommentThread: (thread: ProjectCommentThread) => void;
  setSelectedCommentThreadId: (threadId: string | null) => void;
  removeCollaboratorLocally: (userId: string) => void;
  renameProjectLocally: (name: string) => void;
}

function updateChapterCommentCounts(
  project: ProjectData,
  chapterId: string,
  threads: ProjectCommentThread[],
) {
  const openCount = threads.filter((thread) => thread.status === "open").length;
  const totalCount = threads.length;

  return {
    ...project,
    chapterCommentCounts: project.chapterCommentCounts.map((count) =>
      count.chapterId === chapterId ? { ...count, openCount, totalCount } : count
    ),
  };
}

function getInitialDraftCache(): Record<string, ChapterDraftCache> {
  if (typeof window === "undefined") return {};
  try {
    const val = window.localStorage.getItem("contextra_draft_cache");
    if (!val) return {};
    const parsed = JSON.parse(val);
    const result: Record<string, ChapterDraftCache> = {};
    for (const key of Object.keys(parsed)) {
      result[key] = {
        ...parsed[key],
        origin: parsed[key].origin ?? "local",
      };
    }
    return result;
  } catch {
    return {};
  }
}

let chapterContentReplacementNonce = 0;

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  selectedProjectId: null,
  selectedChapterId: null,
  activeBranchId: "",
  isGenerating: false,
  isStoryBibleOpen: false,
  pendingTitleFocusChapterId: null,
  aiCards: [],
  pendingInsertion: null,
  chapterContentCache: {},
  chapterDraftCache: getInitialDraftCache(),
  pendingChapterContentReplacements: {},
  commentThreadsByChapter: {},
  selectedCommentThreadId: null,

  setProject: (project) => set((state) => {
    const isSameProject = state.project?.metadata.id === project?.metadata.id;
    return {
      project,
      commentThreadsByChapter: isSameProject ? state.commentThreadsByChapter : {},
      selectedCommentThreadId: isSameProject ? state.selectedCommentThreadId : null,
    };
  }),
  hydrateProject: (project) => set((state) => {
    const isSameProject = state.project?.metadata.id === project.metadata.id;
    const nextSelectedProjectId = project.metadata.id;
    const currentBranch = project.branches.find((branch) => branch.id === state.activeBranchId);
    const fallbackBranch = currentBranch || project.branches.find((branch) => branch.name === "Main") || project.branches[0];
    const nextActiveBranchId = fallbackBranch?.id ?? "";
    const hasSelectedChapter = state.selectedChapterId
      ? project.chapters.some((chapter) => chapter.id === state.selectedChapterId)
      : false;
    const fallbackChapter = hasSelectedChapter
      ? project.chapters.find((chapter) => chapter.id === state.selectedChapterId)
      : fallbackBranch
        ? project.chapters.find((chapter) => chapter.branchId === fallbackBranch.id) || project.chapters[0]
        : project.chapters[0];

    return {
      project,
      selectedProjectId: nextSelectedProjectId,
      activeBranchId: nextActiveBranchId,
      selectedChapterId: fallbackChapter?.id ?? null,
      commentThreadsByChapter: isSameProject ? state.commentThreadsByChapter : {},
      selectedCommentThreadId: isSameProject ? state.selectedCommentThreadId : null,
    };
  }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIsStoryBibleOpen: (isStoryBibleOpen) => set({ isStoryBibleOpen }),
  requestTitleFocus: (pendingTitleFocusChapterId) => set({ pendingTitleFocusChapterId }),
  clearPendingTitleFocus: () => set({ pendingTitleFocusChapterId: null }),
  createAiCard: (card) => {
    const id = crypto.randomUUID();
    set((state) => ({
      aiCards: [
        {
          ...card,
          id,
          timestamp: Date.now(),
          status: card.status ?? "ready",
        },
        ...state.aiCards,
      ],
    }));
    return id;
  },
  updateAiCard: (id, data) => set((state) => ({
    aiCards: state.aiCards.map((card) =>
      card.id === id ? { ...card, ...data } : card
    ),
  })),
  removeAiCard: (id) => set((state) => ({
    aiCards: state.aiCards.filter((c) => c.id !== id)
  })),
  insertContent: (pendingInsertion) => set({ pendingInsertion }),
  clearPendingInsertion: () => set({ pendingInsertion: null }),
  updateChapterMetaLocally: (chapterId, data) => set((state) => {
    if (!state.project) return state;

    return {
      project: {
        ...state.project,
        chapters: state.project.chapters.map((c: ChapterMeta) => 
          c.id === chapterId ? { ...c, ...data } as ChapterMeta : c
        ) as ChapterMeta[]
      }
    };
  }),
  setChapterDraft: (chapterId, draft) => set((state) => {
    const nextDraftCache = {
      ...state.chapterDraftCache,
      [chapterId]: draft,
    };
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("contextra_draft_cache", JSON.stringify(nextDraftCache));
      }
    } catch {}
    return {
      chapterDraftCache: nextDraftCache,
    };
  }),
  clearChapterDraft: (chapterId) => set((state) => {
    if (!(chapterId in state.chapterDraftCache)) {
      return state;
    }

    const nextDraftCache = { ...state.chapterDraftCache };
    delete nextDraftCache[chapterId];

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("contextra_draft_cache", JSON.stringify(nextDraftCache));
      }
    } catch {}

    return {
      chapterDraftCache: nextDraftCache,
    };
  }),
  setChapterContent: (chapterId, content) => set((state) => ({
    chapterContentCache: { ...state.chapterContentCache, [chapterId]: content }
  })),
  replaceChapterContent: (chapterId, content) => set((state) => {
    chapterContentReplacementNonce += 1;

    return {
      chapterContentCache: { ...state.chapterContentCache, [chapterId]: content },
      pendingChapterContentReplacements: {
        ...state.pendingChapterContentReplacements,
        [chapterId]: {
          content,
          nonce: chapterContentReplacementNonce,
        },
      },
    };
  }),
  consumeChapterContentReplacement: (chapterId, nonce) => set((state) => {
    const replacement = state.pendingChapterContentReplacements[chapterId];
    if (!replacement || replacement.nonce !== nonce) {
      return state;
    }

    const nextReplacements = { ...state.pendingChapterContentReplacements };
    delete nextReplacements[chapterId];

    return {
      pendingChapterContentReplacements: nextReplacements,
    };
  }),
  reorderChaptersLocally: (branchId, orderedIds) => set((state) => {
    if (!state.project) return state;

    const branchChapterMap = new Map<string, ChapterMeta>();
    for (const chapter of state.project.chapters) {
      if (chapter.branchId === branchId) {
        branchChapterMap.set(chapter.id, chapter);
      }
    }

    const reorderedBranchChapters: (ChapterMeta & { index: number })[] = [];
    for (let i = 0; i < orderedIds.length; i += 1) {
      const chapter = branchChapterMap.get(orderedIds[i]);
      if (chapter) {
        reorderedBranchChapters.push({ ...chapter, index: i + 1 });
      }
    }

    let reorderedIndex = 0;
    const chapters = state.project.chapters.map((chapter: ChapterMeta) => {
      if (chapter.branchId !== branchId) return chapter;
      const reorderedChapter = reorderedBranchChapters[reorderedIndex];
      reorderedIndex += 1;
      return reorderedChapter ?? chapter;
    });

    return { project: { ...state.project, chapters } };
  }),
  appendProjectAiMessage: (message) => set((state) => {
    if (!state.project) return state;

    return {
      project: {
        ...state.project,
        aiMessages: [...(state.project.aiMessages ?? []), message],
      },
    };
  }),
  updateProjectAiMessage: (messageId, data) => set((state) => {
    if (!state.project) return state;

    return {
      project: {
        ...state.project,
        aiMessages: (state.project.aiMessages ?? []).map((message) =>
          message.id === messageId ? { ...message, ...data } : message
        ),
      },
    };
  }),
  syncProjectInvite: (invite) => set((state) => {
    if (!state.project || state.project.metadata.id !== invite.projectId) return state;

    const pendingInvites =
      invite.status === "pending"
        ? [
            invite,
            ...state.project.pendingInvites.filter((existingInvite) => existingInvite.id !== invite.id),
          ]
        : state.project.pendingInvites.filter((existingInvite) => existingInvite.id !== invite.id);

    const collaborators =
      invite.status === "accepted" && !state.project.collaborators.some((collaborator) => collaborator.userId === invite.receiverUserId)
        ? [
            ...state.project.collaborators,
            {
              id: `invite-${invite.id}`,
              projectId: invite.projectId,
              userId: invite.receiverUserId,
              role: `level-${invite.permissionLevel}`,
              permissionLevel: invite.permissionLevel,
              createdAt: invite.updatedAt,
              user: invite.receiver,
            },
          ]
        : state.project.collaborators;

    return {
      project: {
        ...state.project,
        pendingInvites,
        collaborators,
      },
    };
  }),
  syncProjectPresence: (userId, presence) => set((state) => {
    if (!state.project) return state;

    const nextPresence = presence
      ? [
          presence,
          ...state.project.presence.filter((entry) => entry.userId !== userId),
        ]
      : state.project.presence.filter((entry) => entry.userId !== userId);

    return {
      project: {
        ...state.project,
        presence: nextPresence,
      },
    };
  }),
  setCommentThreads: (chapterId, threads) => set((state) => {
    if (!state.project) {
      return {
        commentThreadsByChapter: {
          ...state.commentThreadsByChapter,
          [chapterId]: threads,
        },
      };
    }

    return {
      project: updateChapterCommentCounts(state.project, chapterId, threads),
      commentThreadsByChapter: {
        ...state.commentThreadsByChapter,
        [chapterId]: threads,
      },
    };
  }),
  upsertCommentThread: (thread) => set((state) => {
    const currentThreads = state.commentThreadsByChapter[thread.chapterId] ?? [];
    const nextThreads = [thread, ...currentThreads.filter((existingThread) => existingThread.id !== thread.id)].sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "open" ? -1 : 1;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

    if (!state.project) {
      return {
        commentThreadsByChapter: {
          ...state.commentThreadsByChapter,
          [thread.chapterId]: nextThreads,
        },
      };
    }

    return {
      project: updateChapterCommentCounts(state.project, thread.chapterId, nextThreads),
      commentThreadsByChapter: {
        ...state.commentThreadsByChapter,
        [thread.chapterId]: nextThreads,
      },
    };
  }),
  setSelectedCommentThreadId: (selectedCommentThreadId) => set({ selectedCommentThreadId }),
  removeCollaboratorLocally: (userId) => set((state) => {
    if (!state.project) return state;

    return {
      project: {
        ...state.project,
        collaborators: state.project.collaborators.filter((collaborator) => collaborator.userId !== userId),
        presence: state.project.presence.filter((presence) => presence.userId !== userId),
      },
    };
  }),
  renameProjectLocally: (name) => set((state) => {
    if (!state.project) return state;
    return {
      project: {
        ...state.project,
        metadata: { ...state.project.metadata, name },
      },
    };
  }),
}));
