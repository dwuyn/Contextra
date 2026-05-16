import { create } from "zustand";
import type {
  ChapterMeta,
  ProjectAiMessage,
  ProjectCommentThread,
  ProjectData,
  ProjectInvite,
  ProjectPresence,
} from "@/types/project";

interface ProjectState {
  project: ProjectData | null;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  activeBranchId: string;
  isGenerating: boolean;
  isStoryBibleOpen: boolean;
  pendingTitleFocusChapterId: string | null;
  aiCards: Array<{ id: string; type: string; content: string; timestamp: number }>;
  pendingInsertion: string | null;
  chapterContentCache: Record<string, string>;
  commentThreadsByChapter: Record<string, ProjectCommentThread[]>;
  selectedCommentThreadId: string | null;

  setProject: (project: ProjectData | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedChapterId: (id: string | null) => void;
  setActiveBranchId: (id: string) => void;
  setIsGenerating: (is: boolean) => void;
  setIsStoryBibleOpen: (is: boolean) => void;
  requestTitleFocus: (chapterId: string) => void;
  clearPendingTitleFocus: () => void;
  addAiCard: (card: { type: string; content: string }) => void;
  removeAiCard: (id: string) => void;
  insertContent: (content: string) => void;
  clearPendingInsertion: () => void;
  updateChapterMetaLocally: (chapterId: string, data: { title?: string; summary?: string }) => void;
  setChapterContent: (chapterId: string, content: string) => void;
  reorderChaptersLocally: (branchId: string, orderedIds: string[]) => void;
  appendProjectAiMessage: (message: ProjectAiMessage) => void;
  updateProjectAiMessage: (messageId: string, data: Partial<Pick<ProjectAiMessage, "content">>) => void;
  syncProjectInvite: (invite: ProjectInvite) => void;
  syncProjectPresence: (userId: string, presence: ProjectPresence | null) => void;
  setCommentThreads: (chapterId: string, threads: ProjectCommentThread[]) => void;
  upsertCommentThread: (thread: ProjectCommentThread) => void;
  setSelectedCommentThreadId: (threadId: string | null) => void;
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
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIsStoryBibleOpen: (isStoryBibleOpen) => set({ isStoryBibleOpen }),
  requestTitleFocus: (pendingTitleFocusChapterId) => set({ pendingTitleFocusChapterId }),
  clearPendingTitleFocus: () => set({ pendingTitleFocusChapterId: null }),
  addAiCard: (card) => set((state) => ({
    aiCards: [{ ...card, id: Math.random().toString(36).substring(7), timestamp: Date.now() }, ...state.aiCards]
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
  setChapterContent: (chapterId, content) => set((state) => ({
    chapterContentCache: { ...state.chapterContentCache, [chapterId]: content }
  })),
  reorderChaptersLocally: (branchId, orderedIds) => set((state) => {
    if (!state.project) return state;

    const branchChapterMap = new Map(
      state.project.chapters
        .filter((chapter: ChapterMeta) => chapter.branchId === branchId)
        .map((chapter: ChapterMeta) => [chapter.id, chapter] as const)
    );

    const reorderedBranchChapters = orderedIds
      .map((id, index) => {
        const chapter = branchChapterMap.get(id);
        return chapter ? { ...chapter, index: index + 1 } : null;
      })
      .filter((chapter): chapter is ChapterMeta => chapter != null);

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
}));
