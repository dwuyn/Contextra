"use client";

import { useState, useEffect } from "react";
import { listProjects, listPublicProjects } from "@/actions/projects";
import { X, Search, Globe, Lock, Clock } from "lucide-react";
import { Link } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import type { ProjectListItem, PublicProject } from "@/types/project";

export function AllProjectsModal({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [publicProjects, setPublicProjects] = useState<PublicProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicPage, setPublicPage] = useState(0);
  const [publicHasMore, setPublicHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"my" | "public">("my");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text)]/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[85vh] rounded-[32px] bg-[var(--color-surface)] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] z-10">
          <div>
            <h2 className="text-2xl font-extrabold text-[var(--color-text)]">Explore Projects</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage your workspaces and discover stories</p>
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
              My Projects
            </button>
            <button
              onClick={handleSelectPublicTab}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === "public" ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              )}
            >
              Public Library
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <label htmlFor="all-projects-search" className="sr-only">
              Search projects
            </label>
            <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={14} />
            <input 
              id="all-projects-search"
              type="text" 
              placeholder="Search..." 
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
                  <p className="text-sm font-bold text-[var(--color-text)]">No {activeTab === "my" ? "personal projects" : "public projects"} found.</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Try adjusting your filters or creating something new.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProjects.map((project) => (
                    <Link key={project.id} href={`/project/${project.id}`}>
                      <div className="group relative flex aspect-[4/3] flex-col rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-[var(--color-border)]">
                        <div className="mb-auto flex items-start justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-bold text-lg">
                            {project.name[0].toUpperCase()}
                          </div>
                          <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                            project.isPublic 
                              ? "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20" 
                              : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
                          )}>
                            {project.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                            {project.isPublic ? "Public" : "Private"}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-[var(--color-text)] mb-1.5 truncate">{project.name}</h4>
                          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-4">
                            {activeTab === "public" && "ownerName" in project ? `by ${project.ownerName}` : (project.summary || "No summary provided.")}
                          </p>
                          
                          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                              <Clock size={12} />
                              {new Date(project.updatedAt).toLocaleDateString()}
                            </div>
                            <span className="text-[10px] font-bold text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-2 py-1 rounded-md uppercase">
                              {project.role ?? "viewer"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
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
                    {publicLoading ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}

              {showPublicEndState && (
                <p className="text-center text-xs text-[var(--color-text-muted)]">You&apos;ve reached the end of the public library.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
