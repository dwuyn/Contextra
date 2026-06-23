"use client";

import { useEffect, useReducer } from "react";
import { listProjects, listPublicProjects, deleteProject } from "@/actions/projects";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { X, Search, Globe, Lock, Clock, MoreHorizontal, Trash2 } from "lucide-react";
import { Link } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import type { ProjectListItem, PublicProject } from "@/types/project";
import { useTranslations } from "next-intl";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type ModalState = {
  projects: ProjectListItem[];
  publicProjects: PublicProject[];
  projectsLoading: boolean;
  publicLoading: boolean;
  publicPage: number;
  publicHasMore: boolean;
  searchQuery: string;
  activeTab: "my" | "public";
  deleteProjectState: { id: string; name: string } | null;
  isDeleting: boolean;
};

type ModalAction =
  | { type: "projectsLoading"; value: boolean }
  | { type: "setProjects"; projects: ProjectListItem[] }
  | { type: "publicLoading"; value: boolean }
  | { type: "setPublicProjects"; projects: PublicProject[]; page: number; hasMore: boolean }
  | { type: "appendPublicProjects"; projects: PublicProject[]; page: number; hasMore: boolean }
  | { type: "setSearchQuery"; value: string }
  | { type: "setActiveTab"; value: "my" | "public" }
  | { type: "setDeleteProjectState"; value: { id: string; name: string } | null }
  | { type: "setIsDeleting"; value: boolean }
  | { type: "removeProject"; id: string };

const initialState: ModalState = {
  projects: [],
  publicProjects: [],
  projectsLoading: true,
  publicLoading: false,
  publicPage: 0,
  publicHasMore: false,
  searchQuery: "",
  activeTab: "my",
  deleteProjectState: null,
  isDeleting: false,
};

function reducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "projectsLoading":
      return { ...state, projectsLoading: action.value };
    case "setProjects":
      return { ...state, projects: action.projects };
    case "publicLoading":
      return { ...state, publicLoading: action.value };
    case "setPublicProjects":
      return {
        ...state,
        publicProjects: action.projects,
        publicPage: action.page,
        publicHasMore: action.hasMore,
      };
    case "appendPublicProjects":
      return {
        ...state,
        publicProjects: [...state.publicProjects, ...action.projects],
        publicPage: action.page,
        publicHasMore: action.hasMore,
      };
    case "setSearchQuery":
      return { ...state, searchQuery: action.value };
    case "setActiveTab":
      return { ...state, activeTab: action.value };
    case "setDeleteProjectState":
      return { ...state, deleteProjectState: action.value };
    case "setIsDeleting":
      return { ...state, isDeleting: action.value };
    case "removeProject":
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== action.id),
      };
    default:
      return state;
  }
}

export function AllProjectsModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("allProjects");
  const projectT = useTranslations("project");
  const dashboardT = useTranslations("dashboard");
  const [state, dispatch] = useReducer(reducer, initialState);
  const hasLoadedPublicProjects = state.publicPage > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      dispatch({ type: "projectsLoading", value: true });
      try {
        const myResponse = await listProjects();
        if (cancelled) return;
        dispatch({ type: "setProjects", projects: myResponse });
      } catch {
        console.error("Failed to load projects");
      } finally {
        if (!cancelled) {
          dispatch({ type: "projectsLoading", value: false });
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadInitialPublicProjects() {
    dispatch({ type: "publicLoading", value: true });
    try {
      const response = await listPublicProjects(1);
      dispatch({
        type: "setPublicProjects",
        projects: response.items,
        page: response.page,
        hasMore: response.hasMore,
      });
    } catch {
      console.error("Failed to load public projects");
    } finally {
      dispatch({ type: "publicLoading", value: false });
    }
  }

  async function handleLoadMorePublicProjects() {
    if (state.publicLoading || !state.publicHasMore) return;

    dispatch({ type: "publicLoading", value: true });
    try {
      const response = await listPublicProjects(state.publicPage + 1);
      dispatch({
        type: "appendPublicProjects",
        projects: response.items,
        page: response.page,
        hasMore: response.hasMore,
      });
    } catch {
      console.error("Failed to load more public projects");
    } finally {
      dispatch({ type: "publicLoading", value: false });
    }
  }

  async function handleDeleteProject() {
    if (!state.deleteProjectState) return;
    dispatch({ type: "setIsDeleting", value: true });
    try {
      await deleteProject(state.deleteProjectState.id);
      dispatch({ type: "removeProject", id: state.deleteProjectState.id });
      dispatch({ type: "setDeleteProjectState", value: null });
    } catch {
      console.error("Failed to delete project");
    } finally {
      dispatch({ type: "setIsDeleting", value: false });
    }
  }

  function handleSelectPublicTab() {
    dispatch({ type: "setActiveTab", value: "public" });
    if (!hasLoadedPublicProjects && !state.publicLoading) {
      void loadInitialPublicProjects();
    }
  }

  const displayProjects = state.activeTab === "my" ? state.projects : state.publicProjects;
  const isActiveTabLoading = state.activeTab === "my" ? state.projectsLoading : state.publicLoading && !hasLoadedPublicProjects;
  const showPublicLoadMore = state.activeTab === "public" && hasLoadedPublicProjects && state.publicHasMore;
  const showPublicEndState =
    state.activeTab === "public" && hasLoadedPublicProjects && !state.publicHasMore && state.publicProjects.length > 0 && !state.publicLoading;

  const filteredProjects = displayProjects.filter((p) => 
    p.name.toLowerCase().includes(state.searchQuery.toLowerCase())
  );

  function getRoleLabel(role: string | undefined) {
    switch (role ?? "viewer") {
      case "owner":
        return t("roles.owner");
      case "editor":
        return t("roles.editor");
      case "public-viewer":
        return t("roles.publicViewer");
      case "viewer":
        return t("roles.viewer");
      default:
        return role ?? t("roles.viewer");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text)]/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[85vh] rounded-[32px] bg-[var(--color-surface)] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10">
          <div>
            <h2 className="text-2xl font-extrabold text-[var(--color-text)]">{t("title")}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose} 
            className="p-2.5 bg-[var(--color-canvas)] hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 gap-4 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/30">
          <div className="flex bg-[var(--color-surface-alt)] p-1 rounded-2xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => dispatch({ type: "setActiveTab", value: "my" })}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                  state.activeTab === "my" ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                )}
              >
                {t("myProjects")}
            </button>
            <button
                type="button"
                onClick={handleSelectPublicTab}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                  state.activeTab === "public" ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                )}
              >
                {t("publicLibrary")}
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <label htmlFor="all-projects-search" className="sr-only">
              {t("searchLabel")}
            </label>
            <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={14} />
              <input 
                id="all-projects-search"
                type="text" 
                placeholder={t("searchPlaceholder")}
                value={state.searchQuery}
                onChange={(e) => dispatch({ type: "setSearchQuery", value: e.target.value })}
                className="w-full rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] px-10 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] transition-colors shadow-sm"
              />
            </div>
        </div>

        {/* Project Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[var(--color-canvas)]">
          {isActiveTabLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-4 border-[var(--color-border)] border-t-indigo-600 animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-16 w-16 bg-[var(--color-surface-alt)] rounded-2xl flex items-center justify-center mb-4 text-[var(--color-text-muted)]">
                    <Search size={32} />
                  </div>
                  <p className="text-sm font-bold text-[var(--color-text)]">
                    {activeTab === "my" ? t("emptyMyProjects") : t("emptyPublicProjects")}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">{t("emptyHelp")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProjects.map((project) => {
                    const isOwner = state.activeTab === "my" && (project as ProjectListItem).role === "owner";
                    return (
                      <ProjectCard
                        key={project.id}
                        activeTab={state.activeTab}
                        project={project}
                        isOwner={isOwner}
                        dashboardT={dashboardT}
                        projectT={projectT}
                        getRoleLabel={getRoleLabel}
                        onDelete={(nextDeleteProjectState) =>
                          dispatch({ type: "setDeleteProjectState", value: nextDeleteProjectState })
                        }
                      />
                    );
                  })}
                </div>
              )}

              {showPublicLoadMore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMorePublicProjects}
                    disabled={publicLoading}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-bold text-[var(--color-text)] shadow-sm transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {publicLoading ? t("loadingMore") : t("loadMore")}
                  </button>
                </div>
              )}

              {showPublicEndState && (
                <p className="text-center text-xs text-[var(--color-text-muted)]">{t("endOfLibrary")}</p>
              )}
            </div>
          )}
        </div>
      </div>
      <ProjectDeleteDialog
        open={state.deleteProjectState !== null}
        onOpenChange={(open) => { if (!open) dispatch({ type: "setDeleteProjectState", value: null }); }}
        projectName={state.deleteProjectState?.name ?? ""}
        busy={state.isDeleting}
        onConfirm={handleDeleteProject}
      />
    </div>
  );
}

function ProjectCard({
  activeTab,
  project,
  isOwner,
  dashboardT,
  projectT,
  getRoleLabel,
  onDelete,
}: {
  activeTab: "my" | "public";
  project: ProjectListItem | PublicProject;
  isOwner: boolean;
  dashboardT: ReturnType<typeof useTranslations>;
  projectT: ReturnType<typeof useTranslations>;
  getRoleLabel: (role: string | undefined) => string;
  onDelete: (project: { id: string; name: string }) => void;
}) {
  const roleLabel = activeTab === "my" && "role" in project ? getRoleLabel(project.role) : projectT("public");
  const cardContent = (
    <>
      <div className="mb-auto flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-muted)] text-lg font-bold text-[var(--color-accent)]">
          {project.name[0].toUpperCase()}
        </div>
        <div className="flex items-center gap-1">
          <div className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
            project.isPublic
              ? "border-[var(--color-success)]/20 bg-[var(--color-success)]/10 text-[var(--color-success)]"
              : "border-[var(--color-border)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)]"
          )}>
            {project.isPublic ? <Globe size={10} /> : <Lock size={10} />}
            {project.isPublic ? projectT("public") : projectT("private")}
          </div>
          {isOwner && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={dashboardT("deleteProject")}
                    className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)]/50 hover:text-[var(--color-text-secondary)]"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="min-w-[160px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl"
                  >
                    <DropdownMenu.Item
                      onClick={() => onDelete({ id: project.id, name: project.name })}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-destructive)] outline-none hover:bg-[var(--color-destructive)]/10"
                    >
                      <Trash2 size={14} />
                      {dashboardT("deleteProject")}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          )}
        </div>
      </div>
      <div>
        <h4 className="mb-1.5 truncate text-lg font-bold text-[var(--color-text)]">{project.name}</h4>
        <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {activeTab === "public" && "ownerName" in project
            ? dashboardT("by", { name: project.ownerName })
            : (project.summary || dashboardT("noSummary"))}
        </p>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            <Clock size={12} />
            {new Date(project.updatedAt).toLocaleDateString()}
          </div>
          <span className="rounded-md bg-[var(--color-accent-muted)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--color-accent)]">
            {roleLabel}
          </span>
        </div>
      </div>
    </>
  );

  const cardClassName =
    "group relative flex aspect-[4/3] flex-col rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-[var(--color-border)] hover:shadow-md cursor-pointer";

  if (activeTab === "my") {
    return (
      <Link href={`/project/${project.id}`} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return (
    <Link href={`/project/${project.id}`}>
      <div className={cardClassName}>{cardContent}</div>
    </Link>
  );
}
