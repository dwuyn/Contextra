"use client";

import { useState, useEffect } from "react";
import { CreateProjectModal } from "./CreateProjectModal";
import { PreferencesModal } from "./PreferencesModal";
import { AllProjectsModal } from "./AllProjectsModal";
import { PeopleView } from "./PeopleView";
import { FriendsView } from "./FriendsView";
import Link from "next/link";
import { 
  Home, 
  Layers, 
  Users, 
  UserPlus, 
  Settings, 
  Plus, 
  Search, 
  Clock,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSocialOverview } from "@/actions/auth";

interface DashboardViewProps {
  user: {
    id: string;
    name: string;
    email: string;
    profileImageUrl?: string | null;
    dateOfBirth?: string | null;
  };
  overview: {
    recentProjects: any[];
    publicProjects: any[];
  };
}

export type ViewType = "home" | "people" | "friends";

export function DashboardView({ user, overview }: DashboardViewProps) {
  const [activeView, setActiveView] = useState<ViewType>("home");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAllProjectsModal, setShowAllProjectsModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [socialData, setSocialData] = useState<any>(null);

  useEffect(() => {
    async function fetchSocial() {
      try {
        const data = await getSocialOverview();
        setSocialData(data);
      } catch (err) {
        console.error("Failed to fetch social overview", err);
      }
    }
    fetchSocial();
  }, []);

  const firstName = user.name.split(" ")[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";

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
              <h2 className="text-5xl font-extrabold text-slate-900 tracking-tight">{greeting}, {firstName}</h2>
            </header>

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
                            <img src={project.coverImageUrl} alt={project.name} className="h-full w-full object-cover" />
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
    <div className="flex h-screen w-full bg-[var(--background)]">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-100 px-4 py-6">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs">
            {user.name[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">Contextra</h1>
            <p className="text-[10px] text-slate-400 mt-1">AI writing space</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
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
            badge={socialData?.users?.length || 0} 
            onClick={() => setActiveView("people")}
          />
          <NavItem 
            icon={<UserPlus size={18} />} 
            label="Friends" 
            active={activeView === "friends"}
            badge={socialData?.friends?.length || 0} 
            onClick={() => setActiveView("friends")}
          />
          
          <NavItem 
            icon={<Settings size={18} />} 
            label="Settings" 
            onClick={() => setShowPreferencesModal(true)} 
          />
        </nav>

        <div className="mt-auto">
          <div className="px-2 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Projects</div>

        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-12 py-10">
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
        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
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
