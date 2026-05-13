import { create } from "zustand";
import type { ProjectData, ChapterMeta } from "@/types/project";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ProjectState {
  project: ProjectData | null;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  activeBranchId: string;
  isGenerating: boolean;
  isStoryBibleOpen: boolean;
  aiCards: Array<{ id: string; type: string; content: string; timestamp: number }>;
  pendingInsertion: string | null;
  chapterContentCache: Record<string, string>;

  setProject: (project: any) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedChapterId: (id: string | null) => void;
  setActiveBranchId: (id: string) => void;
  setIsGenerating: (is: boolean) => void;
  setIsStoryBibleOpen: (is: boolean) => void;
  addAiCard: (card: { type: string; content: string }) => void;
  removeAiCard: (id: string) => void;
  insertContent: (content: string) => void;
  clearPendingInsertion: () => void;
  updateChapterLocally: (chapterId: string, data: { title?: string; content?: string }) => void;
  setChapterContent: (chapterId: string, content: string) => void;
  reorderChaptersLocally: (orderedIds: string[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  selectedProjectId: null,
  selectedChapterId: null,
  activeBranchId: "",
  isGenerating: false,
  isStoryBibleOpen: false,
  aiCards: [],
  pendingInsertion: null,
  chapterContentCache: {},

  setProject: (project) => set({ project }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIsStoryBibleOpen: (isStoryBibleOpen) => set({ isStoryBibleOpen }),
  addAiCard: (card) => set((state) => ({
    aiCards: [{ ...card, id: Math.random().toString(36).substring(7), timestamp: Date.now() }, ...state.aiCards]
  })),
  removeAiCard: (id) => set((state) => ({
    aiCards: state.aiCards.filter((c) => c.id !== id)
  })),
  insertContent: (pendingInsertion) => set({ pendingInsertion }),
  clearPendingInsertion: () => set({ pendingInsertion: null }),
  updateChapterLocally: (chapterId, data) => set((state) => {
    if (!state.project) return state;
    
    // Also update cache if content is provided
    let newCache = state.chapterContentCache;
    if (data.content !== undefined) {
      newCache = { ...state.chapterContentCache, [chapterId]: data.content };
    }

    return {
      chapterContentCache: newCache,
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
  reorderChaptersLocally: (orderedIds) => set((state) => {
    if (!state.project) return state;
    const chapterMap = new Map(state.project.chapters.map((c: ChapterMeta) => [c.id, c]));
    const reordered = orderedIds
      .map((id, index) => ({ ...(chapterMap.get(id) as ChapterMeta), index: index + 1 }))
      .filter((c) => c.id != null) as ChapterMeta[];
    return { project: { ...state.project, chapters: reordered } };
  }),
}));
