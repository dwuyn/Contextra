"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/useProjectStore";
import { SidebarNavigator } from "@/components/SidebarNavigator";
import { MainEditor } from "@/components/MainEditor";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { LoadingState } from "@/components/LoadingState";
import type { AiCardsPaneTab } from "@/components/AiCardsPane";
import { useSSE } from "@/lib/hooks/useSSE";
import { useTranslations } from "next-intl";
import { Menu, Bot, History, Users } from "lucide-react";
import type { ProjectCommentThread, ProjectData, ProjectInvite, ProjectPresence } from "@/types/project";

const AiCardsPane = dynamic(
  () => import("@/components/AiCardsPane").then((mod) => mod.AiCardsPane),
  {
    ssr: false,
    loading: () => <LoadingState variant="overlay" message="Loading AI assistant..." />,
  }
);

const StoryBibleView = dynamic(
  () => import("@/components/StoryBibleView").then((mod) => mod.StoryBibleView),
  {
    ssr: false,
    loading: () => <LoadingState variant="inline" message="Loading story bible..." />,
  }
);

const VersionHistoryPanel = dynamic(
  () => import("@/components/VersionHistoryPanel").then((mod) => mod.VersionHistoryPanel),
  {
    ssr: false,
    loading: () => <LoadingState variant="overlay" message="Loading version history..." />,
  }
);

export function ProjectWorkspace({ project }: { project: ProjectData }) {
  const router = useRouter();
  const setProject = useProjectStore((state) => state.setProject);
  const syncProjectInvite = useProjectStore((state) => state.syncProjectInvite);
  const syncProjectPresence = useProjectStore((state) => state.syncProjectPresence);
  const removeCollaboratorLocally = useProjectStore((state) => state.removeCollaboratorLocally);
  const upsertCommentThread = useProjectStore((state) => state.upsertCommentThread);
  const setSelectedProjectId = useProjectStore((state) => state.setSelectedProjectId);
  const setSelectedChapterId = useProjectStore((state) => state.setSelectedChapterId);
  const setActiveBranchId = useProjectStore((state) => state.setActiveBranchId);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const activeBranchId = useProjectStore((state) => state.activeBranchId);
  const isStoryBibleOpen = useProjectStore((state) => state.isStoryBibleOpen);
  const hydratedProject = useProjectStore((state) => state.project) ?? project;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);
  const [hasOpenedAiPane, setHasOpenedAiPane] = useState(false);
  const [aiPaneTab, setAiPaneTab] = useState<AiCardsPaneTab>("history");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCollabOpen, setIsCollabOpen] = useState(false);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const t = useTranslations();

  useEffect(() => {
    if (!project) return;

    setProject(project);

    const isNewProject = selectedProjectId !== project.metadata.id;
    if (isNewProject) {
      setSelectedProjectId(project.metadata.id);
    }

    const currentBranch = project.branches.find((branch) => branch.id === activeBranchId);
    const fallbackBranch = currentBranch || project.branches.find((branch) => branch.name === "Main") || project.branches[0];
    if (fallbackBranch && (isNewProject || fallbackBranch.id !== activeBranchId)) {
      setActiveBranchId(fallbackBranch.id);
    }

    const hasSelectedChapter = selectedChapterId ? project.chapters.some((chapter) => chapter.id === selectedChapterId) : false;
    if (!hasSelectedChapter) {
      const fallbackChapter = fallbackBranch
        ? project.chapters.find((chapter) => chapter.branchId === fallbackBranch.id) || project.chapters[0]
        : project.chapters[0];

      setSelectedChapterId(fallbackChapter?.id ?? null);
    }
  }, [
    project,
    selectedProjectId,
    activeBranchId,
    selectedChapterId,
    setProject,
    setSelectedProjectId,
    setSelectedChapterId,
    setActiveBranchId,
  ]);

  useSSE((event, data) => {
    if (typeof data.projectId !== "string" || data.projectId !== hydratedProject.metadata.id) {
      return;
    }

    if (event === "project_access_revoked") {
      const projectName = typeof data.projectName === "string" ? data.projectName : hydratedProject.metadata.name;
      const kind = data.kind === "left" ? "left" : "removed";
      const nextSearchParams = new URLSearchParams({
        membership: kind,
        project: projectName,
      });
      router.replace(`/?${nextSearchParams.toString()}`);
      return;
    }

    if (event === "project_invite_updated" && data.invite) {
      syncProjectInvite(data.invite as ProjectInvite);
      return;
    }

    if (event === "project_member_removed" && typeof data.memberUserId === "string") {
      removeCollaboratorLocally(data.memberUserId);
      return;
    }

    if (event === "project_presence_updated") {
      syncProjectPresence(
        typeof data.userId === "string" ? data.userId : "",
        (data.presence as ProjectPresence | null | undefined) ?? null,
      );
      return;
    }

    if ((event === "project_comment_created" || event === "project_comment_updated") && data.thread) {
      upsertCommentThread(data.thread as ProjectCommentThread);
    }
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const shouldRenderAiPane = hasOpenedAiPane || isAiPaneOpen;
  const activePresence = hydratedProject.presence.filter((presence) => {
    return presenceNow - new Date(presence.lastActiveAt).getTime() < 60_000;
  });

  const handleAiPaneToggle = () => {
    if (!isAiPaneOpen) {
      setHasOpenedAiPane(true);
    }

    setIsAiPaneOpen((value) => !value);
  };

  const handleOpenAiHistory = () => {
    setHasOpenedAiPane(true);
    setIsAiPaneOpen(true);
    setAiPaneTab("history");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-canvas)] relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[var(--color-canvas)]/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, static on desktop */}
      <nav aria-label="Project navigation" className={[
        "fixed lg:static inset-y-0 left-0 z-40 lg:z-auto transition-transform duration-300",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}>
        <SidebarNavigator />
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Desktop Top Bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Project</p>
            <h1 className="text-lg font-bold text-[var(--color-text)] truncate">{project.metadata.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCollabOpen((value) => !value)}
              className={[
                "flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors",
                isCollabOpen ? "border-[var(--color-text)] bg-[var(--color-text)] text-white" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]",
              ].join(" ")}
            >
              <PresenceStack count={activePresence.length} />
              <span className="text-sm font-bold">Collaborate</span>
            </button>
            <WorkspaceToggleButton
              active={isHistoryOpen}
              icon={<History size={18} />}
              label="History"
              onClick={() => setIsHistoryOpen((value) => !value)}
            />
            <WorkspaceToggleButton
              active={isAiPaneOpen}
              icon={<Bot size={18} />}
              label="AI Assistant"
              onClick={handleAiPaneToggle}
            />
          </div>
        </div>

        {/* Mobile Top Bar */}
        <div className="flex lg:hidden items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold text-[var(--color-text)] truncate max-w-[160px]">
            {project.metadata.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCollabOpen((value) => !value)}
              className={[
                "p-2 rounded-xl transition-colors",
                isCollabOpen ? "bg-[var(--color-text)] text-white" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
              ].join(" ")}
              aria-label="Toggle collaboration panel"
            >
              <Users size={20} />
            </button>
            <button
              onClick={() => setIsHistoryOpen((value) => !value)}
              className={[
                "p-2 rounded-xl transition-colors",
                isHistoryOpen ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
              ].join(" ")}
              aria-label="Toggle version history"
            >
              <History size={20} />
            </button>
            <button
              onClick={handleAiPaneToggle}
              className={[
                "p-2 rounded-xl transition-colors",
                isAiPaneOpen ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
              ].join(" ")}
              aria-label="Toggle AI assistant"
            >
              <Bot size={20} />
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-hidden">
          {isStoryBibleOpen ? (
            <StoryBibleView />
          ) : (
            <MainEditor
              onToggleHistory={() => setIsHistoryOpen((v) => !v)}
              onOpenAiHistory={handleOpenAiHistory}
            />
          )}
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

      {isCollabOpen && (
        <div className="hidden lg:flex">
          <CollaborationPanel onClose={() => setIsCollabOpen(false)} />
        </div>
      )}

      {isCollabOpen && (
        <div className="fixed inset-y-0 right-0 z-40 lg:hidden shadow-2xl">
          <CollaborationPanel onClose={() => setIsCollabOpen(false)} />
        </div>
      )}

      {/* AI Pane — mounted on first open, then kept alive for quick reopen */}
      {shouldRenderAiPane && (
        <div className={[
          "fixed inset-y-0 right-0 z-40 transition-transform duration-300 lg:relative lg:inset-y-auto lg:right-auto lg:z-auto lg:transition-[width] lg:duration-300",
          isAiPaneOpen ? "translate-x-0 lg:w-96" : "translate-x-full lg:translate-x-0 lg:w-0",
        ].join(" ")}>
          <div className="h-full overflow-hidden shadow-2xl lg:shadow-none">
            <AiCardsPane
              activeTab={aiPaneTab}
              onTabChange={setAiPaneTab}
              onClose={() => setIsAiPaneOpen(false)}
              showCloseButton={isAiPaneOpen}
            />
          </div>
        </div>
      )}

      {/* Mobile AI Pane Overlay */}
      {isAiPaneOpen && (
        <div
          className="fixed inset-0 z-30 bg-[var(--color-canvas)]/50 lg:hidden"
          onClick={() => setIsAiPaneOpen(false)}
        />
      )}
    </div>
  );
}

function WorkspaceToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors",
        active
          ? "border-[var(--color-accent-muted)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PresenceStack({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        <div className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-text)]" />
        {count > 1 && <div className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] bg-amber-400" />}
        {count > 2 && <div className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] bg-sky-400" />}
      </div>
      <span className="text-xs font-bold uppercase tracking-wider">
        {count === 0 ? "Quiet" : `${count} live`}
      </span>
    </div>
  );
}


