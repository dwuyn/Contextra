"use client";

import { useEffect, useRef, useReducer, Suspense } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { CreateProjectModal } from "./CreateProjectModal";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { LoadingState } from "@/components/LoadingState";
import { Link } from "@/lib/i18n-client";
import {
  Home,
  Layers,
  Users,
  UserPlus,
  Settings,
  Plus,
  Clock,
  MoreHorizontal,
  X,
  Trash2,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { getSocialOverview } from "@/actions/auth";
import { respondToProjectInvite, deleteProject } from "@/actions/projects";
import { useSSE } from "@/lib/hooks/useSSE";
import type { HomeOverviewData, PendingProjectInviteCard, ProjectListItem } from "@/types/project";

const PreferencesModal = dynamic(
  () => import("./PreferencesModal").then((mod) => mod.PreferencesModal),
  {
    ssr: false,
    loading: () => <LoadingState variant="fullscreen" />,
  }
);

const AllProjectsModal = dynamic(
  () => import("./AllProjectsModal").then((mod) => mod.AllProjectsModal),
  {
    ssr: false,
    loading: () => <LoadingState variant="fullscreen" />,
  }
);

const PeopleView = dynamic(
  () => import("./PeopleView").then((mod) => mod.PeopleView),
  {
    ssr: false,
    loading: () => <LoadingState variant="inline" />,
  }
);

const FriendsView = dynamic(
  () => import("./FriendsView").then((mod) => mod.FriendsView),
  {
    ssr: false,
    loading: () => <LoadingState variant="inline" />,
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

type MembershipBanner = {
  kind: "removed" | "left";
  projectName: string;
};

type DashboardState = {
  activeView: ViewType;
  activeModal: "create" | "allProjects" | "preferences" | null;
  socialData: SocialOverview | null;
  pendingProjectInvites: PendingProjectInviteCard[];
  inviteActionId: string | null;
  recentProjects: ProjectListItem[];
  projectDeletion: {
    project: { id: string; name: string } | null;
    isBusy: boolean;
  };
  isMembershipBannerDismissed: boolean;
  membershipBanner: MembershipBanner | null;
};

type DashboardAction =
  | { type: "setActiveView"; view: ViewType }
  | { type: "setActiveModal"; modal: DashboardState["activeModal"] }
  | { type: "setSocialData"; data: SocialOverview | null }
  | { type: "setPendingProjectInvites"; invites: PendingProjectInviteCard[] | ((prev: PendingProjectInviteCard[]) => PendingProjectInviteCard[]) }
  | { type: "setInviteActionId"; id: string | null }
  | { type: "setRecentProjects"; projects: ProjectListItem[] | ((prev: ProjectListItem[]) => ProjectListItem[]) }
  | { type: "setProjectDeletion"; project: { id: string; name: string } | null; isBusy?: boolean }
  | { type: "dismissMembershipBanner" };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "setActiveView":
      return { ...state, activeView: action.view };
    case "setActiveModal":
      return { ...state, activeModal: action.modal };
    case "setSocialData":
      return { ...state, socialData: action.data };
    case "setPendingProjectInvites":
      return {
        ...state,
        pendingProjectInvites: typeof action.invites === "function"
          ? action.invites(state.pendingProjectInvites)
          : action.invites
      };
    case "setInviteActionId":
      return { ...state, inviteActionId: action.id };
    case "setRecentProjects":
      return {
        ...state,
        recentProjects: typeof action.projects === "function"
          ? action.projects(state.recentProjects)
          : action.projects
      };
    case "setProjectDeletion":
      return {
        ...state,
        projectDeletion: {
          project: action.project,
          isBusy: action.isBusy ?? state.projectDeletion.isBusy,
        },
      };
    case "dismissMembershipBanner":
      return { ...state, isMembershipBannerDismissed: true };
    default:
      return state;
  }
}

export function DashboardView({ user, overview }: DashboardViewProps) {

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dt = useTranslations("dashboard");
  const membershipKind = searchParams.get("membership");
  const membershipProjectName = searchParams.get("project");

  const [state, dispatch] = useReducer(dashboardReducer, null, () => {
    let initialMembershipBanner: MembershipBanner | null = null;
    if (membershipProjectName && (membershipKind === "removed" || membershipKind === "left")) {
      initialMembershipBanner = {
        kind: membershipKind,
        projectName: membershipProjectName,
      };
    }

    return {
      activeView: "home" as ViewType,
      activeModal: null as DashboardState["activeModal"],
      socialData: null,
      pendingProjectInvites: overview.pendingProjectInvites,
      inviteActionId: null,
      recentProjects: overview.recentProjects,
      projectDeletion: { project: null, isBusy: false },
      isMembershipBannerDismissed: false,
      membershipBanner: initialMembershipBanner,
    };
  });
  const hasRequestedSocialData = useRef(false);

  useEffect(() => {
    dispatch({ type: "setRecentProjects", projects: overview.recentProjects });
  }, [overview.recentProjects]);

  useEffect(() => {
    dispatch({ type: "setPendingProjectInvites", invites: overview.pendingProjectInvites });
  }, [overview.pendingProjectInvites]);

  useEffect(() => {
    if (state.activeView === "home" || hasRequestedSocialData.current) return;

    let cancelled = false;

    async function fetchSocialOverview() {
      hasRequestedSocialData.current = true;
      try {
        const data = await getSocialOverview();
        if (!cancelled) {
          dispatch({ type: "setSocialData", data });
        }
      } catch (err) {
        console.error("Failed to fetch social overview", err);
      }
    }

    fetchSocialOverview();

    return () => {
      cancelled = true;
    };
  }, [state.activeView]);

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

      dispatch({
        type: "setPendingProjectInvites",
        invites: (currentInvites) => {
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
        }
      });
    }

    if (event === "project_invite_updated" && typeof data.invite === "object" && data.invite) {
      const invite = data.invite as { id: string; status: string };
      if (invite.status !== "pending") {
        dispatch({
          type: "setPendingProjectInvites",
          invites: (currentInvites) => currentInvites.filter((item) => item.id !== invite.id)
        });
      }
    }
  });

  useEffect(() => {
    if (!membershipProjectName || (membershipKind !== "removed" && membershipKind !== "left")) {
      return;
    }

    // Clean membership banner params from URL after displaying once.
    // Client-side redirect is intentional — server redirect would cause a flash.
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("membership");
    nextSearchParams.delete("project");
    const nextUrl = nextSearchParams.size > 0 ? `${pathname}?${nextSearchParams.toString()}` : pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [membershipKind, membershipProjectName, pathname, searchParams]);

  const firstName = user.name.split(" ")[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? dt("greeting_morning") : hour < 17 ? dt("greeting_afternoon") : hour < 21 ? dt("greeting_evening") : dt("greeting_night");
  const visibleMembershipBanner = state.isMembershipBannerDismissed ? null : state.membershipBanner;

  async function handleDeleteProject() {
    if (!state.projectDeletion.project) return;
    dispatch({ type: "setProjectDeletion", project: state.projectDeletion.project, isBusy: true });
    try {
      await deleteProject(state.projectDeletion.project.id);
      const deletedId = state.projectDeletion.project.id;
      dispatch({
        type: "setRecentProjects",
        projects: (current) => current.filter((p) => p.id !== deletedId)
      });
      dispatch({ type: "setProjectDeletion", project: null, isBusy: false });
    } catch (error) {
      console.error("Failed to delete project", error);
      dispatch({ type: "setProjectDeletion", project: state.projectDeletion.project, isBusy: false });
    }
  }

  async function handleProjectInvite(inviteId: string, status: "accepted" | "declined") {
    dispatch({ type: "setInviteActionId", id: inviteId });
    try {
      await respondToProjectInvite(inviteId, { status });
      dispatch({
        type: "setPendingProjectInvites",
        invites: (currentInvites) => currentInvites.filter((invite) => invite.id !== inviteId)
      });
    } catch (error) {
      console.error("Failed to respond to project invite", error);
    } finally {
      dispatch({ type: "setInviteActionId", id: null });
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--background)] lg:h-screen lg:flex-row">
      <DashboardSidebar
        user={user}
        activeView={state.activeView}
        recentProjectCount={overview.recentProjects.length}
        socialData={state.socialData}
        onNavigate={(view) => dispatch({ type: "setActiveView", view })}
        onAllProjects={() => dispatch({ type: "setActiveModal", modal: "allProjects" })}
        onPreferences={() => dispatch({ type: "setActiveModal", modal: "preferences" })}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-8 lg:px-12 lg:py-10">
        {state.activeView === "people" ? (
          <PeopleView onClose={() => dispatch({ type: "setActiveView", view: "home" })} />
        ) : state.activeView === "friends" ? (
          <FriendsView />
        ) : (
          <>
            <DashboardHeader greeting={greeting} firstName={firstName} />
            {visibleMembershipBanner && (
              <MembershipAlert banner={visibleMembershipBanner} onDismiss={() => dispatch({ type: "dismissMembershipBanner" })} />
            )}
            {state.pendingProjectInvites.length > 0 && (
              <PendingInvitesSection invites={state.pendingProjectInvites} actionId={state.inviteActionId} onInviteResponse={handleProjectInvite} />
            )}
            <RecentProjectsSection projects={state.recentProjects} onCreate={() => dispatch({ type: "setActiveModal", modal: "create" })} onDeleteClick={(p) => dispatch({ type: "setProjectDeletion", project: p, isBusy: false })} />
            <PublicProjectsSection projects={overview.publicProjects} />
          </>
        )}
      </main>

      {state.activeModal === "create" && <CreateProjectModal onClose={() => dispatch({ type: "setActiveModal", modal: null })} />}
      {state.activeModal === "allProjects" && <AllProjectsModal onClose={() => dispatch({ type: "setActiveModal", modal: null })} />}
      {state.activeModal === "preferences" && (
        <Suspense>
          <PreferencesModal 
            onClose={() => dispatch({ type: "setActiveModal", modal: null })} 
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              profileImageUrl: user.profileImageUrl || undefined,
              dob: user.dateOfBirth || undefined
            }} 
          />
        </Suspense>
      )}
      <ProjectDeleteDialog
        open={state.projectDeletion.project !== null}
        onOpenChange={(open) => { if (!open) dispatch({ type: "setProjectDeletion", project: null, isBusy: false }); }}
        projectName={state.projectDeletion.project?.name ?? ""}
        busy={state.projectDeletion.isBusy}
        onConfirm={handleDeleteProject}
      />
    </div>
  );
}

function NavItem({ icon, label, active, badge, disabled, onClick }: { icon: React.ReactNode, label: string, active?: boolean, badge?: number, disabled?: boolean, onClick?: () => void }) {
  return (
    <button 
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-fit items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-all lg:w-full",
        active ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]",
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
          active ? "bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]" : "bg-[var(--color-canvas)] text-[var(--color-text-muted)]"
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

function DashboardHeader({ greeting, firstName }: { greeting: string; firstName: string }) {
  const dt = useTranslations("dashboard");
  return (
    <header className="mb-12">
      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{dt("workspaceOverview")}</p>
      <h2 className="text-4xl lg:text-5xl font-extrabold text-[var(--color-text)] tracking-tight">{greeting}, {firstName}</h2>
    </header>
  );
}

function MembershipAlert({ banner, onDismiss }: { banner: MembershipBanner; onDismiss: () => void }) {
  const dt = useTranslations("dashboard");
  return (
    <section role="alert" aria-live="polite" className="mb-8 flex items-start justify-between gap-4 rounded-[24px] border border-[var(--color-accent-muted)] bg-[var(--color-accent-muted)] px-5 py-4 text-amber-900">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">{dt("membershipUpdate")}</p>
        <p className="mt-2 text-sm font-semibold">
          {banner.kind === "removed"
            ? dt("removedAccess", { projectName: banner.projectName })
            : dt("leftProject", { projectName: banner.projectName })}
        </p>
      </div>
      <button type="button" onClick={onDismiss} className="rounded-xl p-2 text-amber-700 transition-colors hover:bg-amber-100" aria-label={dt("dismissMembership")}>
        <X size={16} />
      </button>
    </section>
  );
}

function PendingInvitesSection({ invites, actionId, onInviteResponse }: { invites: PendingProjectInviteCard[]; actionId: string | null; onInviteResponse: (id: string, status: "accepted" | "declined") => void }) {
  const dt = useTranslations("dashboard");
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{dt("collaborationRequests")}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">{dt("waitingResponse", { count: invites.length })}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {invites.map((invite) => (
          <div key={invite.id} className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{dt("inviteFrom", { name: invite.sender.name })}</p>
            <h3 className="mt-3 text-xl font-bold text-[var(--color-text)]">{invite.projectName}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{invite.projectSummary || dt("noSummary")}</p>
            <div className="mt-4 inline-flex rounded-full bg-[var(--color-canvas)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              {dt("permissionLevel", { level: invite.permissionLevel })}
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => void onInviteResponse(invite.id, "accepted")} disabled={actionId === invite.id} className="rounded-2xl bg-[var(--color-text)] px-4 py-2 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                {actionId === invite.id ? dt("working") : dt("accept")}
              </button>
              <button type="button" onClick={() => void onInviteResponse(invite.id, "declined")} disabled={actionId === invite.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)] disabled:cursor-not-allowed disabled:opacity-60">
                {dt("decline")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentProjectsSection({ projects, onCreate, onDeleteClick }: { projects: ProjectListItem[]; onCreate: () => void; onDeleteClick: (state: { id: string; name: string }) => void }) {
  const t = useTranslations();
  const dt = useTranslations("dashboard");
  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{t("project.recent")}</h3>
        <button type="button" onClick={onCreate} className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors shadow-sm">
          {t("project.new")}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button type="button" onClick={onCreate} className="group relative flex aspect-[4/3] flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-[var(--color-border)] bg-transparent transition-all hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-canvas)] text-[var(--color-text-muted)] group-hover:bg-[var(--color-surface)] group-hover:text-[var(--color-text-secondary)] transition-colors">
            <Plus size={24} />
          </div>
          <div className="text-center px-8">
            <h4 className="text-lg font-bold text-[var(--color-text)] mb-2">{t("project.new")}</h4>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{projects.length > 0 ? t("project.startNew") : t("project.createFirst")}</p>
          </div>
        </button>
        {projects.map((project) => {
          const isOwner = project.role === "owner";
          return (
            <Link key={project.id} href={`/project/${project.id}`} className="group relative flex aspect-[4/3] flex-col rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 cursor-pointer">
              <div className="mb-auto flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-bold text-lg">
                  {project.name[0].toUpperCase()}
                </div>
                {isOwner && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" aria-label={dt("deleteProject")} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1 rounded-md hover:bg-[var(--color-surface)]/50 transition-colors">
                          <MoreHorizontal size={20} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content align="end" sideOffset={4} className="min-w-[160px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl">
                          <DropdownMenu.Item onClick={() => onDeleteClick({ id: project.id, name: project.name })} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-destructive)] outline-none cursor-pointer hover:bg-[var(--color-destructive)]/10">
                            <Trash2 size={14} />
                            {dt("deleteProject")}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-xl font-bold text-[var(--color-text)] mb-2 truncate">{project.name}</h4>
                <p className="text-sm text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">{project.summary}</p>
                <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                  <Clock size={12} />
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PublicProjectsSection({ projects }: { projects: HomeOverviewData["publicProjects"] }) {
  const t = useTranslations();
  const dt = useTranslations("dashboard");
  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{t("project.publicProjects")}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">{dt("publicProjectHelper")}</p>
      </div>
      {projects.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-[32px] border border-dashed border-[var(--color-border)] bg-[var(--color-canvas)] px-8 text-center text-sm text-[var(--color-text-muted)]">
          {dt("noPublicProjects")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {projects.map((project) => (
            <Link key={project.id} href={`/project/${project.id}`}>
              <div className="group flex flex-col rounded-[24px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 transition-all hover:shadow-sm">
                <div className="aspect-video w-full rounded-xl bg-[var(--color-surface-alt)] mb-4 overflow-hidden">
                  {project.coverImageUrl ? (
                    <Image src={project.coverImageUrl} alt={project.name} width={320} height={180} sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[var(--color-border)] font-bold">{dt("imagePlaceholder")}</div>
                  )}
                </div>
                <h5 className="font-bold text-[var(--color-text)] truncate">{project.name}</h5>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1 uppercase tracking-wider">{dt("by", { name: project.ownerName })}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardSidebar({ user, activeView, recentProjectCount, socialData, onNavigate, onAllProjects, onPreferences }: { user: { name: string }; activeView: ViewType; recentProjectCount: number; socialData: SocialOverview | null; onNavigate: (view: ViewType) => void; onAllProjects: () => void; onPreferences: () => void }) {
  const t = useTranslations();
  const dt = useTranslations("dashboard");
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--color-border)] px-4 py-4 lg:h-full lg:w-64 lg:border-b-0 lg:border-r lg:py-6">
      <div className="flex items-center gap-3 px-2 mb-4 lg:mb-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-text)] text-white font-bold text-xs">
          {user.name[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-sm font-bold text-[var(--color-text)] leading-none">Contextra</h1>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{dt("brandTagline")}</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:flex-1 lg:space-y-1 lg:overflow-visible lg:pb-0">
        <NavItem icon={<Home size={18} />} label={t("nav.dashboard")} active={activeView === "home"} onClick={() => onNavigate("home")} />
        <NavItem icon={<Layers size={18} />} label={t("nav.projects")} badge={recentProjectCount} onClick={onAllProjects} />
        <NavItem icon={<Users size={18} />} label={t("nav.people")} active={activeView === "people"} badge={socialData ? socialData.users.length : undefined} onClick={() => onNavigate("people")} />
        <NavItem icon={<UserPlus size={18} />} label={t("nav.friends")} active={activeView === "friends"} badge={socialData ? socialData.friends.length : undefined} onClick={() => onNavigate("friends")} />
        <NavItem icon={<Settings size={18} />} label={t("nav.settings")} onClick={onPreferences} />
      </nav>
      <div className="mt-auto hidden lg:block">
        <div className="px-2 py-4 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{t("nav.projects")}</div>
      </div>
    </aside>
  );
}
