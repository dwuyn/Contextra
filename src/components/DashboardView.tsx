"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { CreateProjectModal } from "./CreateProjectModal";
import Link from "next/link";
import {
  Home, 
  Layers, 
  Users, 
  UserPlus, 
  Settings, 
  Plus, 
  Clock,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSocialOverview } from "@/actions/auth";
import { respondToProjectInvite } from "@/actions/projects";
import { useSSE } from "@/lib/hooks/useSSE";
import type { HomeOverviewData, PendingProjectInviteCard } from "@/types/project";

const PreferencesModal = dynamic(
  () => import("./PreferencesModal").then((mod) => mod.PreferencesModal),
  {
    ssr: false,
    loading: () => <DashboardModalLoading label="Loading settings..." />,
  }
);

const AllProjectsModal = dynamic(
  () => import("./AllProjectsModal").then((mod) => mod.AllProjectsModal),
  {
    ssr: false,
    loading: () => <DashboardModalLoading label="Loading projects..." />,
  }
);

const PeopleView = dynamic(
  () => import("./PeopleView").then((mod) => mod.PeopleView),
  {
    ssr: false,
    loading: () => <DashboardSurfaceLoading label="Loading people..." />,
  }
);

const FriendsView = dynamic(
  () => import("./FriendsView").then((mod) => mod.FriendsView),
  {
    ssr: false,
    loading: () => <DashboardSurfaceLoading label="Loading friends..." />,
  }
);

interface DashboardViewProps {
  user: {
    id: string;
    name: string;
    email: string;
    profileImageUrl?: string | null;
    dateOfBirth?: string | null;
  };
  overview: HomeOverviewData;
}

export type ViewType = "home" | "people" | "friends";

type SocialOverview = {
  users: unknown[];
  friends: unknown[];
  incomingRequests: unknown[];
  outgoingRequests: unknown[];
};

export function DashboardView({ user, overview }: DashboardViewProps) {
  const [activeView, setActiveView] = useState<ViewType>("home");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAllProjectsModal, setShowAllProjectsModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [socialData, setSocialData] = useState<SocialOverview | null>(null);
  const [hasRequestedSocialData, setHasRequestedSocialData] = useState(false);
  const [pendingProjectInvites, setPendingProjectInvites] = useState<PendingProjectInviteCard[]>(overview.pendingProjectInvites);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  useEffect(() => {
    if (activeView === "home" || hasRequestedSocialData) return;

    let cancelled = false;

    async function fetchSocialOverview() {
      setHasRequestedSocialData(true);
      try {
        const data = await getSocialOverview();
        if (!cancelled) {
          setSocialData(data);
        }
      } catch (err) {
        console.error("Failed to fetch social overview", err);
      }
    }

    fetchSocialOverview();

    return () => {
      cancelled = true;
    };
  }, [activeView, hasRequestedSocialData]);

  useSSE((event, data) => {
    if (event === "project_invite_created") {
      if (
        typeof data.projectId !== "string" ||
        typeof data.projectName !== "string" ||
        typeof data.projectSummary !== "string" ||
        !data.invite
      ) {
        return;
      }

      const invite = data.invite as {
        id: string;
        permissionLevel: number;
        sender: PendingProjectInviteCard["sender"];
      };
      const projectId = data.projectId;
      const projectName = data.projectName;
      const projectSummary = data.projectSummary;

      setPendingProjectInvites((currentInvites) => {
        const nextInvite: PendingProjectInviteCard = {
          id: invite.id,
          projectId,
          projectName,
          projectSummary,
          permissionLevel: invite.permissionLevel,
          sender: invite.sender,
          createdAt: new Date().toISOString(),
        };

        return [nextInvite, ...currentInvites.filter((item) => item.id !== nextInvite.id)];
      });
    }

    if (event === "project_invite_updated" && typeof data.invite === "object" && data.invite) {
      const invite = data.invite as { id: string; status: string };
      if (invite.status !== "pending") {
        setPendingProjectInvites((currentInvites) => currentInvites.filter((item) => item.id !== invite.id));
      }
    }
  });

  const firstName = user.name.split(" ")[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";

  async function handleProjectInvite(inviteId: string, status: "accepted" | "declined") {
    setInviteActionId(inviteId);
    try {
      await respondToProjectInvite(inviteId, { status });
      setPendingProjectInvites((currentInvites) => currentInvites.filter((invite) => invite.id !== inviteId));
    } catch (error) {
      console.error("Failed to respond to project invite", error);
    } finally {
      setInviteActionId(null);
    }
  }

  const renderContent = () => {
    switch (activeView) {
      case "people":
        return <PeopleView onClose={() => setActiveView("home")} />;
      case "friends":
        return <FriendsView onClose={() => setActiveView("home")} />;
      default:
        return (
          <>
            <header className="mb-12">
              <p className="text-xs font-medium text-slate-400 mb-2">Workspace overview</p>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">{greeting}, {firstName}</h2>
            </header>

            {pendingProjectInvites.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Collaboration requests</h3>
                  <p className="text-xs text-slate-400">{pendingProjectInvites.length} waiting for your response</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {pendingProjectInvites.map((invite) => (
                    <div key={invite.id} className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Invite from {invite.sender.name}</p>
                      <h3 className="mt-3 text-xl font-bold text-slate-900">{invite.projectName}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{invite.projectSummary || "No summary yet."}</p>
                      <div className="mt-4 inline-flex rounded-full bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Permission level {invite.permissionLevel}
                      </div>
                      <div className="mt-5 flex gap-3">
                        <button
                          type="button"
                          onClick={() => void handleProjectInvite(invite.id, "accepted")}
                          disabled={inviteActionId === invite.id}
                          className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {inviteActionId === invite.id ? "Working..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleProjectInvite(invite.id, "declined")}
                          disabled={inviteActionId === invite.id}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-16">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Recently visited</h3>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Create project
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* New Project Card */}
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="group relative flex aspect-[4/3] flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-slate-200 bg-transparent transition-all hover:border-slate-400 hover:bg-slate-50"
                >
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-slate-600 transition-colors">
                    <Plus size={24} />
                  </div>
                  <div className="text-center px-8">
                    <h4 className="text-lg font-bold text-slate-900 mb-2">New project</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">Create your first workspace and start writing with context-aware AI.</p>
                  </div>
                </button>

                {overview.recentProjects.map((project) => (
                  <Link key={project.id} href={`/project/${project.id}`}>
                    <div className="group relative flex aspect-[4/3] flex-col rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
                      <div className="mb-auto flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-lg">
                          {project.name[0].toUpperCase()}
                        </div>
                        <button title="Coming soon" disabled className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-white/50 transition-colors disabled:opacity-50">
                          <MoreHorizontal size={20} />
                        </button>
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-slate-900 mb-2 truncate">{project.name}</h4>
                        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">{project.summary}</p>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                          <Clock size={12} />
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Public projects</h3>
                <p className="text-xs text-slate-400">Projects shared by other members</p>
              </div>

              {overview.publicProjects.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-[32px] border border-dashed border-slate-200 bg-slate-50 px-8 text-center text-sm text-slate-400">
                  No public projects yet. Publish one from the Projects panel to share it.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {overview.publicProjects.map((project) => (
                    <Link key={project.id} href={`/project/${project.id}`}>
                      <div className="group flex flex-col rounded-[24px] bg-white border border-slate-100 p-5 transition-all hover:shadow-sm">
                        <div className="aspect-video w-full rounded-xl bg-slate-100 mb-4 overflow-hidden">
                          {project.coverImageUrl ? (
                            <Image
                              src={project.coverImageUrl}
                              alt={project.name}
                              width={320}
                              height={180}
                              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-200 font-bold">IMAGE</div>
                          )}
                        </div>
                        <h5 className="font-bold text-slate-900 truncate">{project.name}</h5>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">by {project.ownerName}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--background)] lg:h-screen lg:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-100 px-4 py-4 lg:h-full lg:w-64 lg:border-b-0 lg:border-r lg:py-6">
        <div className="flex items-center gap-3 px-2 mb-4 lg:mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs">
            {user.name[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">Contextra</h1>
            <p className="text-[10px] text-slate-400 mt-1">AI writing space</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:flex-1 lg:space-y-1 lg:overflow-visible lg:pb-0">
          <NavItem 
            icon={<Home size={18} />} 
            label="Home" 
            active={activeView === "home"} 
            onClick={() => setActiveView("home")}
          />
          <NavItem 
            icon={<Layers size={18} />} 
            label="Projects" 
            badge={overview.recentProjects.length} 
            onClick={() => setShowAllProjectsModal(true)}
          />
          <NavItem 
            icon={<Users size={18} />} 
            label="People" 
            active={activeView === "people"}
            badge={socialData ? socialData.users.length : undefined}
            onClick={() => setActiveView("people")}
          />
          <NavItem 
            icon={<UserPlus size={18} />} 
            label="Friends" 
            active={activeView === "friends"}
            badge={socialData ? socialData.friends.length : undefined}
            onClick={() => setActiveView("friends")}
          />
          
          <NavItem 
            icon={<Settings size={18} />} 
            label="Settings" 
            onClick={() => setShowPreferencesModal(true)} 
          />
        </nav>

        <div className="mt-auto hidden lg:block">
          <div className="px-2 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Projects</div>

        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-8 lg:px-12 lg:py-10">
        {renderContent()}
      </main>

      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
      {showAllProjectsModal && <AllProjectsModal onClose={() => setShowAllProjectsModal(false)} />}
      {showPreferencesModal && (
        <PreferencesModal 
          onClose={() => setShowPreferencesModal(false)} 
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            profileImageUrl: user.profileImageUrl || undefined,
            dob: user.dateOfBirth || undefined
          }} 
        />
      )}
    </div>
  );
}

function NavItem({ icon, label, active, badge, disabled, onClick }: { icon: React.ReactNode, label: string, active?: boolean, badge?: number, disabled?: boolean, onClick?: () => void }) {
  return (
    <button 
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-fit items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-all lg:w-full",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        {label}
      </div>
      {badge !== undefined && (
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-md",
          active ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400"
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

function DashboardSurfaceLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-500 shadow-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function DashboardModalLoading({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-500 shadow-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        <span>{label}</span>
      </div>
    </div>
  );
}
