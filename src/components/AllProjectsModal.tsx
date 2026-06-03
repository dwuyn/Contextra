"use client";

import { useState, useEffect } from "react";
import { listProjects, listPublicProjects, deleteProject } from "@/actions/projects";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { X, Search, Globe, Lock, Clock, MoreHorizontal, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import type { ProjectListItem, PublicProject } from "@/types/project";
import { useTranslations } from "next-intl";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function AllProjectsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const t = useTranslations("allProjects");
  const projectT = useTranslations("project");
  const dashboardT = useTranslations("dashboard");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [publicProjects, setPublicProjects] = useState<PublicProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicPage, setPublicPage] = useState(0);
  const [publicHasMore, setPublicHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"my" | "public">("my");
  const [deleteProjectState, setDeleteProjectState] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasLoadedPublicProjects = publicPage > 0;

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setProjectsLoading(true);
      try {
        const myResponse = await listProjects();
        if (cancelled) return;
        setProjects(myResponse);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadInitialPublicProjects() {
    setPublicLoading(true);
    try {
      const response = await listPublicProjects(1);
      setPublicProjects(response.items);
      setPublicPage(response.page);
      setPublicHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load public projects", err);
    } finally {
      setPublicLoading(false);
    }
  }

  async function handleLoadMorePublicProjects() {
    if (publicLoading || !publicHasMore) return;

    setPublicLoading(true);
    try {
      const response = await listPublicProjects(publicPage + 1);
      setPublicProjects((current) => [...current, ...response.items]);
      setPublicPage(response.page);
      setPublicHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load more public projects", err);
    } finally {
      setPublicLoading(false);
    }
  }

  async function handleDeleteProject() {
    if (!deleteProjectState) return;
    setIsDeleting(true);
    try {
      await deleteProject(deleteProjectState.id);
      setProjects((current) => current.filter((p) => p.id !== deleteProjectState.id));
      setDeleteProjectState(null);
    } catch (error) {
      console.error("Failed to delete project", error);
    } finally {
      setIsDeleting(false);
    }
  }

  function handleSelectPublicTab() {
    setActiveTab("public");
    if (!hasLoadedPublicProjects && !publicLoading) {
      void loadInitialPublicProjects();
    }
  }

  const displayProjects = activeTab === "my" ? projects : publicProjects;
  const isActiveTabLoading = activeTab === "my" ? projectsLoading : publicLoading && !hasLoadedPublicProjects;
  const showPublicLoadMore = activeTab === "public" && hasLoadedPublicProjects && publicHasMore;
  const showPublicEndState =
    activeTab === "public" && hasLoadedPublicProjects && !publicHasMore && publicProjects.length > 0 && !publicLoading;

  const filteredProjects = displayProjects.filter((p) => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
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
              onClick={() => setActiveTab("my")}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === "my" ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              )}
            >
              {t("myProjects")}
            </button>
            <button
              onClick={handleSelectPublicTab}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === "public" ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProjects.map((project) => {
                    const isMyProject = activeTab === "my";
                    const isOwner = isMyProject && (project as ProjectListItem).role === "owner";
                    const cardContent = (
                      <>
                        <div className="mb-auto flex items-start justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-bold text-lg">
                            {project.name[0].toUpperCase()}
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                              project.isPublic 
                                ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20" 
                                : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
                            )}>
                              {project.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                              {project.isPublic ? projectT("public") : projectT("private")}
                            </div>
                            {isOwner && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu.Root>
                                  <DropdownMenu.Trigger asChild>
                                    <button
                                      aria-label={dashboardT("deleteProject")}
                                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1 rounded-md hover:bg-[var(--color-surface)]/50 transition-colors"
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
                                        onClick={() => setDeleteProjectState({ id: project.id, name: project.name })}
                                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-destructive)] outline-none cursor-pointer hover:bg-[var(--color-destructive)]/10"
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
                          <h4 className="text-lg font-bold text-[var(--color-text)] mb-1.5 truncate">{project.name}</h4>
                          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-4">
                            {activeTab === "public" && "ownerName" in project
                              ? dashboardT("by", { name: project.ownerName })
                              : (project.summary || dashboardT("noSummary"))}
                          </p>
                          
                          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                              <Clock size={12} />
                              {new Date(project.updatedAt).toLocaleDateString()}
                            </div>
                            <span className="text-[10px] font-bold text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-2 py-1 rounded-md uppercase">
                              {getRoleLabel(project.role)}
                            </span>
                          </div>
                        </div>
                      </>
                    );

                    if (isMyProject) {
                      return (
                        <div
                          key={project.id}
                          className="group relative flex aspect-[4/3] flex-col rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-[var(--color-border)] cursor-pointer"
                          onClick={() => router.push(`/project/${project.id}`)}
                        >
                          {cardContent}
                        </div>
                      );
                    }

                    return (
                      <Link key={project.id} href={`/project/${project.id}`}>
                        <div className="group relative flex aspect-[4/3] flex-col rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-[var(--color-border)]">
                          {cardContent}
                        </div>
                      </Link>
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
        open={deleteProjectState !== null}
        onOpenChange={(open) => { if (!open) setDeleteProjectState(null); }}
        projectName={deleteProjectState?.name ?? ""}
        busy={isDeleting}
        onConfirm={handleDeleteProject}
      />
    </div>
  );
}
