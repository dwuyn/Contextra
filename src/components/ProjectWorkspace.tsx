"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { SidebarNavigator } from "@/components/SidebarNavigator";
import { MainEditor } from "@/components/MainEditor";
import { AiCardsPane } from "@/components/AiCardsPane";
import { StoryBibleView } from "@/components/StoryBibleView";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { Menu, X, Bot, History } from "lucide-react";
import type { ProjectData } from "@/types/project";

export function ProjectWorkspace({ project }: { project: ProjectData }) {
  const { 
    setProject, 
    setSelectedProjectId, 
    setSelectedChapterId, 
    setActiveBranchId,
    selectedChapterId,
    isStoryBibleOpen 
  } = useProjectStore();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    if (project) {
      setProject(project);
      setSelectedProjectId(project.metadata.id);

      const mainBranch = project.branches.find((b: { name: string }) => b.name === "Main") || project.branches[0];
      if (mainBranch) {
        setActiveBranchId(mainBranch.id);
        if (project.chapters.length > 0) {
          const firstChapter = project.chapters.find((c: { branchId: string }) => c.branchId === mainBranch.id) || project.chapters[0];
          setSelectedChapterId(firstChapter.id);
        }
      }
    }
  }, [project, setProject, setSelectedProjectId, setSelectedChapterId, setActiveBranchId]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f5] relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, static on desktop */}
      <div className={[
        "fixed lg:static inset-y-0 left-0 z-40 lg:z-auto transition-transform duration-300",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}>
        <SidebarNavigator />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Mobile Top Bar */}
        <div className="flex lg:hidden items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold text-slate-700 truncate max-w-[160px]">
            {project.metadata.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={[
                "p-2 rounded-xl transition-colors",
                isHistoryOpen ? "bg-indigo-100 text-indigo-600" : "text-slate-500 hover:bg-slate-100"
              ].join(" ")}
              aria-label="Toggle version history"
            >
              <History size={20} />
            </button>
            <button
              onClick={() => setIsAiPaneOpen(!isAiPaneOpen)}
              className={[
                "p-2 rounded-xl transition-colors",
                isAiPaneOpen ? "bg-indigo-100 text-indigo-600" : "text-slate-500 hover:bg-slate-100"
              ].join(" ")}
              aria-label="Toggle AI assistant"
            >
              <Bot size={20} />
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-hidden">
          {isStoryBibleOpen ? <StoryBibleView /> : <MainEditor key={selectedChapterId} onToggleHistory={() => setIsHistoryOpen((v) => !v)} />}
        </div>
      </main>

      {/* Version History Panel */}
      {isHistoryOpen && selectedChapterId && (
        <div className="hidden lg:flex">
          <VersionHistoryPanel onClose={() => setIsHistoryOpen(false)} />
        </div>
      )}

      {/* Mobile Version History Drawer */}
      {isHistoryOpen && selectedChapterId && (
        <div className="fixed inset-y-0 right-0 z-40 lg:hidden shadow-2xl">
          <VersionHistoryPanel onClose={() => setIsHistoryOpen(false)} />
        </div>
      )}

      {/* AI Pane — hidden on mobile unless toggled */}
      <div className={[
        "fixed lg:static inset-y-0 right-0 z-40 lg:z-auto transition-transform duration-300",
        isAiPaneOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
      ].join(" ")}>
        <AiCardsPane onClose={() => setIsAiPaneOpen(false)} showCloseButton={isAiPaneOpen} />
      </div>

      {/* Mobile AI Pane Overlay */}
      {isAiPaneOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setIsAiPaneOpen(false)}
        />
      )}
    </div>
  );
}
