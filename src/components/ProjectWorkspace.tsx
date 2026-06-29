"use client";

import { useEffect, useEffectEvent, useRef, useState, useReducer } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useRouter } from "@/lib/i18n-client";
import { useProjectStore } from "@/store/useProjectStore";
import { useZenStore } from "@/store/useZenStore";
import { SidebarNavigator } from "@/components/SidebarNavigator";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { CommandPalette } from "@/components/CommandPalette";
import { LoadingState } from "@/components/LoadingState";
import type { AiCardsPaneTab } from "@/components/AiCardsPane";
import { useSSE } from "@/lib/hooks/useSSE";
import { cn } from "@/lib/utils";
import { Menu, Bot, History, Users, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProjectCommentThread, ProjectData, ProjectInvite, ProjectPresence } from "@/types/project";

function EditorLoadingOverlay() {
  const t = useTranslations("workspace");
  return <LoadingState variant="overlay" message={t("loadingEditor")} />;
}

function AiAssistantLoadingOverlay() {
  const t = useTranslations("workspace");
  return <LoadingState variant="overlay" message={t("loadingAiAssistant")} />;
}

function StoryBibleLoadingState() {
  const t = useTranslations("workspace");
  return <LoadingState variant="inline" message={t("loadingStoryBible")} />;
}

function VersionHistoryLoadingOverlay() {
  const t = useTranslations("workspace");
  return <LoadingState variant="overlay" message={t("loadingVersionHistory")} />;
}

const MainEditor = dynamic(
  () => import("@/components/MainEditor").then((mod) => mod.MainEditor),
  {
    ssr: false,
    loading: () => <EditorLoadingOverlay />,
  }
);

const AiCardsPane = dynamic(
  () => import("@/components/AiCardsPane").then((mod) => mod.AiCardsPane),
  {
    ssr: false,
    loading: () => <AiAssistantLoadingOverlay />,
  }
);

const StoryBibleView = dynamic(
  () => import("@/components/StoryBibleView").then((mod) => mod.StoryBibleView),
  {
    ssr: false,
    loading: () => <StoryBibleLoadingState />,
  }
);

const VersionHistoryPanel = dynamic(
  () => import("@/components/VersionHistoryPanel").then((mod) => mod.VersionHistoryPanel),
  {
    ssr: false,
    loading: () => <VersionHistoryLoadingOverlay />,
  }
);

interface WorkspaceUiState {
  isSidebarOpen: boolean;
  isAiPaneOpen: boolean;
  hasOpenedAiPane: boolean;
  aiPaneTab: AiCardsPaneTab;
  isHistoryOpen: boolean;
  isCollabOpen: boolean;
  showChrome: boolean;
}

type WorkspaceUiAction =
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR"; open: boolean }
  | { type: "TOGGLE_AI_PANE" }
  | { type: "OPEN_AI_HISTORY" }
  | { type: "CLOSE_AI_PANE" }
  | { type: "SET_AI_PANE_TAB"; tab: AiCardsPaneTab }
  | { type: "TOGGLE_HISTORY" }
  | { type: "SET_HISTORY"; open: boolean }
  | { type: "TOGGLE_COLLAB" }
  | { type: "SET_COLLAB"; open: boolean }
  | { type: "SET_SHOW_CHROME"; show: boolean };

const initialWorkspaceUiState: WorkspaceUiState = {
  isSidebarOpen: true,
  isAiPaneOpen: false,
  hasOpenedAiPane: false,
  aiPaneTab: "history",
  isHistoryOpen: false,
  isCollabOpen: false,
  showChrome: false,
};

function workspaceUiReducer(state: WorkspaceUiState, action: WorkspaceUiAction): WorkspaceUiState {
  switch (action.type) {
    case "TOGGLE_SIDEBAR":
      return { ...state, isSidebarOpen: !state.isSidebarOpen };
    case "SET_SIDEBAR":
      return { ...state, isSidebarOpen: action.open };
    case "TOGGLE_AI_PANE": {
      const nextOpen = !state.isAiPaneOpen;
      return {
        ...state,
        isAiPaneOpen: nextOpen,
        hasOpenedAiPane: state.hasOpenedAiPane || nextOpen,
      };
    }
    case "OPEN_AI_HISTORY":
      return {
        ...state,
        isAiPaneOpen: true,
        hasOpenedAiPane: true,
        aiPaneTab: "history",
      };
    case "CLOSE_AI_PANE":
      return { ...state, isAiPaneOpen: false };
    case "SET_AI_PANE_TAB":
      return { ...state, aiPaneTab: action.tab };
    case "TOGGLE_HISTORY":
      return { ...state, isHistoryOpen: !state.isHistoryOpen };
    case "SET_HISTORY":
      return { ...state, isHistoryOpen: action.open };
    case "TOGGLE_COLLAB":
      return { ...state, isCollabOpen: !state.isCollabOpen };
    case "SET_COLLAB":
      return { ...state, isCollabOpen: action.open };
    case "SET_SHOW_CHROME":
      return { ...state, showChrome: action.show };
    default:
      return state;
  }
}

interface CollaborationPersistence {
  status: "healthy" | "degraded" | "disabled";
  lastError: string | null;
}

interface HealthResponse {
  collaborationPersistence?: CollaborationPersistence;
}

async function fetchWorkspaceHealth(url: string): Promise<HealthResponse> {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Health poll failed");
  }

  return response.json() as Promise<HealthResponse>;
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
      type="button"
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
  const t = useTranslations("workspace");

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        <div className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-text)]" />
        {count > 1 && <div className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] bg-amber-400" />}
        {count > 2 && <div className="h-7 w-7 rounded-full border-2 border-[var(--color-surface)] bg-sky-400" />}
      </div>
      <span className="text-xs font-bold uppercase tracking-wider">
        {count === 0 ? t("quiet") : t("liveCount", { count })}
      </span>
    </div>
  );
}

function WorkspaceHeader({
  projectName,
  isZenMode,
  chromeVisible,
  collaborationPersistence,
  uiState,
  activePresenceCount,
  onToggleCollab,
  onToggleHistory,
  onToggleAiPane,
  onOpenSidebar,
}: {
  projectName: string;
  isZenMode: boolean;
  chromeVisible: boolean;
  collaborationPersistence: CollaborationPersistence | null;
  uiState: WorkspaceUiState;
  activePresenceCount: number;
  onToggleCollab: () => void;
  onToggleHistory: () => void;
  onToggleAiPane: () => void;
  onOpenSidebar: () => void;
}) {
  const t = useTranslations("workspace");

  return (
    <>
      {/* Desktop Top Bar */}
      <div className={cn(
        "hidden lg:flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]",
        isZenMode && !chromeVisible && "opacity-0 pointer-events-none -translate-y-full",
        isZenMode && chromeVisible && "opacity-100",
        "transition-all duration-500",
      )}>
        <div className="min-w-0 flex-1 pr-4 flex items-center gap-3">
          {!uiState.isSidebarOpen && (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="p-2 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors shrink-0"
              aria-label="Show sidebar"
              title="Show sidebar"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("projectLabel")}</p>
            <h1 title={projectName} className="break-words text-lg font-bold text-[var(--color-text)]">
              {projectName}
            </h1>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {collaborationPersistence && collaborationPersistence.status === "degraded" && (
            <div
              className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 transition-all shadow-sm"
              title={collaborationPersistence.lastError || "Collaboration storage degraded"}
            >
              <AlertTriangle size={14} className="text-red-600 animate-pulse" />
              <span className="hidden sm:inline">Collab Degraded</span>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollab}
            className={[
              "flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors",
              uiState.isCollabOpen ? "border-[var(--color-text)] bg-[var(--color-text)] text-white" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]",
            ].join(" ")}
          >
            <PresenceStack count={activePresenceCount} />
            <span className="text-sm font-bold">{t("collaborate")}</span>
          </button>
          <WorkspaceToggleButton
            active={uiState.isHistoryOpen}
            icon={<History size={18} />}
            label={t("history")}
            onClick={onToggleHistory}
          />
          <WorkspaceToggleButton
            active={uiState.isAiPaneOpen}
            icon={<Bot size={18} />}
            label={t("aiAssistant")}
            onClick={onToggleAiPane}
          />
        </div>
      </div>

      {/* Mobile Top Bar */}
      <div className={cn(
        "flex lg:hidden items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]",
        isZenMode && !chromeVisible && "opacity-0 pointer-events-none -translate-y-full",
        isZenMode && chromeVisible && "opacity-100",
        "transition-all duration-500",
      )}>
        <button
          type="button"
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors"
          aria-label={t("openSidebar")}
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-bold text-[var(--color-text)] truncate max-w-[160px]">
          {projectName}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollab}
            className={[
              "p-2 rounded-xl transition-colors",
              uiState.isCollabOpen ? "bg-[var(--color-text)] text-white" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
            ].join(" ")}
            aria-label={t("toggleCollaboration")}
          >
            <Users size={20} />
          </button>
          <button
            type="button"
            onClick={onToggleHistory}
            className={[
              "p-2 rounded-xl transition-colors",
              uiState.isHistoryOpen ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
            ].join(" ")}
            aria-label={t("toggleHistory")}
          >
            <History size={20} />
          </button>
          <button
            type="button"
            onClick={onToggleAiPane}
            className={[
              "p-2 rounded-xl transition-colors",
              uiState.isAiPaneOpen ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
            ].join(" ")}
            aria-label={t("toggleAiAssistant")}
          >
            <Bot size={20} />
          </button>
        </div>
      </div>
    </>
  );
}

function WorkspacePanels({
  isZenMode,
  uiState,
  selectedChapterId,
  onCloseHistory,
  onCloseCollab,
  onCloseAiPane,
  onTabChange,
}: {
  isZenMode: boolean;
  uiState: WorkspaceUiState;
  selectedChapterId: string | null;
  onCloseHistory: () => void;
  onCloseCollab: () => void;
  onCloseAiPane: () => void;
  onTabChange: (tab: AiCardsPaneTab) => void;
}) {
  const shouldRenderAiPane = uiState.hasOpenedAiPane || uiState.isAiPaneOpen;
  return (
    <>
      {/* Version History Panel */}
      {!isZenMode && uiState.isHistoryOpen && selectedChapterId && (
        <div className="hidden lg:flex">
          <VersionHistoryPanel onClose={onCloseHistory} />
        </div>
      )}

      {/* Mobile Version History Drawer */}
      {!isZenMode && uiState.isHistoryOpen && selectedChapterId && (
        <div className="fixed inset-y-0 right-0 z-40 lg:hidden shadow-2xl">
          <VersionHistoryPanel onClose={onCloseHistory} />
        </div>
      )}

      {!isZenMode && uiState.isCollabOpen && (
        <div className="hidden lg:flex">
          <CollaborationPanel onClose={onCloseCollab} />
        </div>
      )}

      {!isZenMode && uiState.isCollabOpen && (
        <div className="fixed inset-y-0 right-0 z-40 lg:hidden shadow-2xl">
          <CollaborationPanel onClose={onCloseCollab} />
        </div>
      )}

      {/* AI Pane — mounted on first open, then kept alive for quick reopen */}
      {!isZenMode && shouldRenderAiPane && (
        <div className={[
          "fixed inset-y-0 right-0 z-40 transition-transform duration-300 lg:relative lg:inset-y-auto lg:right-auto lg:z-auto lg:transition-[width] lg:duration-300",
          uiState.isAiPaneOpen ? "translate-x-0 lg:w-[440px]" : "translate-x-full lg:translate-x-0 lg:w-0",
        ].join(" ")}>
          <div className="h-full overflow-hidden shadow-2xl lg:shadow-none">
            <AiCardsPane
              activeTab={uiState.aiPaneTab}
              onTabChange={onTabChange}
              onClose={onCloseAiPane}
              showCloseButton={uiState.isAiPaneOpen}
            />
          </div>
        </div>
      )}

      {/* Mobile AI Pane Overlay */}
      {uiState.isAiPaneOpen && (
        <button
          type="button"
          aria-label="Close AI assistant"
          className="fixed inset-0 z-30 bg-[var(--color-canvas)]/50 lg:hidden block"
          onClick={onCloseAiPane}
        />
      )}
    </>
  );
}

export function ProjectWorkspace({ project }: { project: ProjectData }) {
  const router = useRouter();
  const t = useTranslations("workspace");
  const zenT = useTranslations("zen");
  const syncProjectInvite = useProjectStore((state) => state.syncProjectInvite);
  const syncProjectPresence = useProjectStore((state) => state.syncProjectPresence);
  const removeCollaboratorLocally = useProjectStore((state) => state.removeCollaboratorLocally);
  const upsertCommentThread = useProjectStore((state) => state.upsertCommentThread);
  const updateChapterMetaLocally = useProjectStore((state) => state.updateChapterMetaLocally);
  const hydrateProject = useProjectStore((state) => state.hydrateProject);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const isStoryBibleOpen = useProjectStore((state) => state.isStoryBibleOpen);
  const hydratedProject = useProjectStore((state) => state.project) ?? project;

  const [state, dispatch] = useReducer(workspaceUiReducer, initialWorkspaceUiState);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const { data: healthData } = useSWR("/api/health", fetchWorkspaceHealth, {
    refreshInterval: 15_000,
    onError: (error) => {
      console.error("Health poll failed", error);
    },
  });
  const collabPersistence = healthData?.collaborationPersistence ?? null;

  const { isZenMode, exitZen } = useZenStore();
  const chromeTimer = useRef<number | null>(null);

  const clearChromeTimer = useEffectEvent(() => {
    if (chromeTimer.current) {
      window.clearTimeout(chromeTimer.current);
      chromeTimer.current = null;
    }
  });

  const handleZenMouseMove = useEffectEvent(() => {
    if (!isZenMode) return;
    dispatch({ type: "SET_SHOW_CHROME", show: true });
    clearChromeTimer();
    chromeTimer.current = window.setTimeout(() => dispatch({ type: "SET_SHOW_CHROME", show: false }), 3000);
  });

  useEffect(() => {
    let resetTimer: number | null = null;
    let listener: (() => void) | null = null;

    if (isZenMode) {
      resetTimer = window.setTimeout(() => dispatch({ type: "SET_SHOW_CHROME", show: false }), 0);
      listener = () => handleZenMouseMove();
      window.addEventListener("mousemove", listener);
    }

    return () => {
      if (resetTimer) window.clearTimeout(resetTimer);
      if (listener) {
        window.removeEventListener("mousemove", listener);
      }
      clearChromeTimer();
    };
  }, [isZenMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isZenMode) {
        exitZen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isZenMode, exitZen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        exitZen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [exitZen]);

  useEffect(() => {
    hydrateProject(project);
  }, [hydrateProject, project]);

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
      return;
    }

    if (event === "project_chapter_saved" && typeof data.chapterId === "string") {
      updateChapterMetaLocally(data.chapterId, {
        title: typeof data.title === "string" ? data.title : undefined,
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
      });

      // Show non-blocking notice when another user saves the currently open chapter
      const projectState = useProjectStore.getState();
      const currentUserId = projectState.project?.currentUser?.id;
      const isOwnSave = typeof data.savedByUserId === "string" && data.savedByUserId === currentUserId;
      if (
        !isOwnSave &&
        data.chapterId === projectState.selectedChapterId &&
        typeof data.savedByName === "string"
      ) {
        useProjectStore.getState().setRemoteSaveNotice({
          chapterId: data.chapterId,
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
          savedByName: data.savedByName,
        });
      }
    }
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const activePresence = hydratedProject.presence.filter((presence) => {
    return presenceNow - new Date(presence.lastActiveAt).getTime() < 60_000;
  });
  const chromeVisible = !isZenMode || state.showChrome;

  const handleAiPaneToggle = () => {
    dispatch({ type: "TOGGLE_AI_PANE" });
  };

  const handleOpenAiHistory = () => {
    dispatch({ type: "OPEN_AI_HISTORY" });
  };

  return (
    <>
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-canvas)] relative">
      {/* Mobile Sidebar Overlay */}
      {state.isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-[var(--color-canvas)]/50 lg:hidden block"
          onClick={() => dispatch({ type: "SET_SIDEBAR", open: false })}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, static on desktop */}
      {!isZenMode && (
      <nav 
        aria-label={t("projectNavigation")} 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 lg:z-auto transition-all duration-300 overflow-hidden",
          state.isSidebarOpen 
            ? "translate-x-0 w-96 max-w-[calc(100vw-3rem)] lg:max-w-none opacity-100" 
            : "-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:pointer-events-none"
        )}
      >
        <SidebarNavigator onCloseSidebar={() => dispatch({ type: "SET_SIDEBAR", open: false })} />
      </nav>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <WorkspaceHeader
          projectName={hydratedProject.metadata.name}
          isZenMode={isZenMode}
          chromeVisible={chromeVisible}
          collaborationPersistence={collabPersistence}
          uiState={state}
          activePresenceCount={activePresence.length}
          onToggleCollab={() => dispatch({ type: "TOGGLE_COLLAB" })}
          onToggleHistory={() => dispatch({ type: "TOGGLE_HISTORY" })}
          onToggleAiPane={handleAiPaneToggle}
          onOpenSidebar={() => dispatch({ type: "SET_SIDEBAR", open: true })}
        />

        {/* Editor Area */}
        <div className={cn(
          "flex-1 overflow-hidden",
          isZenMode && "max-w-2xl mx-auto w-full",
        )}>
          {/* MainEditor stays mounted — hidden via CSS when Story Bible is open to avoid unmount/remount content loss */}
          <div className={isStoryBibleOpen ? "hidden" : "contents"}>
            <MainEditor
              onToggleHistory={() => dispatch({ type: "TOGGLE_HISTORY" })}
              onOpenAiHistory={handleOpenAiHistory}
            />
          </div>
          {isStoryBibleOpen && <StoryBibleView />}
        </div>
      </main>

      <WorkspacePanels
        isZenMode={isZenMode}
        uiState={state}
        selectedChapterId={selectedChapterId}
        onCloseHistory={() => dispatch({ type: "SET_HISTORY", open: false })}
        onCloseCollab={() => dispatch({ type: "SET_COLLAB", open: false })}
        onCloseAiPane={() => dispatch({ type: "CLOSE_AI_PANE" })}
        onTabChange={(tab) => dispatch({ type: "SET_AI_PANE_TAB", tab })}
      />

      {isZenMode && chromeVisible && (
        <button
          type="button"
          onClick={exitZen}
          className="fixed bottom-6 right-6 z-50 rounded-full bg-[var(--color-surface)] px-4 py-2
            text-sm font-medium text-[var(--color-text-secondary)] shadow-lg border border-[var(--color-border)]
            hover:text-[var(--color-text)] transition-all"
          aria-label={zenT("exit")}
        >
          {zenT("exit")}
        </button>
      )}
    </div>

    <CommandPalette chapters={hydratedProject.chapters.map(ch => ({ id: ch.id, title: ch.title }))} />
    </>
  );
}
