"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "@/lib/i18n-client";
import {
  Check,
  Clock3,
  Eye,
  LogOut,
  Loader2,
  MessageSquare,
  PencilLine,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFriends } from "@/actions/friends";
import {
  cancelProjectInvite,
  createProjectInvite,
  getChapterCommentThreads,
  removeProjectMember,
  replyToCommentThread,
  updateCommentThreadStatus,
} from "@/actions/projects";
import { useProjectStore } from "@/store/useProjectStore";
import type { ProjectCommentThread } from "@/types/project";
import { useLocale, useTranslations } from "next-intl";

type FriendSummary = {
  id: string;
  name: string;
  email: string;
  profileImageUrl?: string | null;
};

type MembershipDialogState =
  | { kind: "remove"; memberUserId: string; memberName: string }
  | { kind: "leave"; memberUserId: string; memberName: string }
  | null;

const ACTIVE_PRESENCE_TTL_MS = 60_000;

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function useFormatTimestamp() {
  const locale = useLocale();
  const localeTag = locale === "vi" ? "vi-VN" : "en-US";
  const formatter = useMemo(() =>
    new Intl.DateTimeFormat(localeTag, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }), [localeTag]);
  return (value: string | Date) => formatter.format(new Date(value));
}

function MemberCard({
  name,
  subtitle,
  badge,
  accent,
  action,
}: {
  name: string;
  subtitle: string;
  badge: string;
  accent: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)]/70 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[var(--color-text)]">{name}</p>
        <p className="truncate text-xs text-[var(--color-text-secondary)]">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", accent)}>
          {badge}
        </span>
      </div>
    </div>
  );
}

type MembersState = {
  friends: FriendSummary[];
  friendSearch: string;
  selectedFriendId: string;
  permissionLevel: string;
  inviteError: string | null;
  memberError: string | null;
  isInviteBusy: boolean;
  inviteActionId: string | null;
  memberActionUserId: string | null;
  membershipDialog: MembershipDialogState;
  now: number;
};

type MembersAction =
  | { type: "setFriends"; friends: FriendSummary[] }
  | { type: "setFriendSearch"; search: string }
  | { type: "setSelectedFriendId"; id: string }
  | { type: "setPermissionLevel"; level: string }
  | { type: "setInviteError"; error: string | null }
  | { type: "setMemberError"; error: string | null }
  | { type: "setInviteBusy"; busy: boolean }
  | { type: "setInviteActionId"; id: string | null }
  | { type: "setMemberActionUserId"; id: string | null }
  | { type: "setMembershipDialog"; dialog: MembershipDialogState }
  | { type: "tickNow" };

function membersReducer(state: MembersState, action: MembersAction): MembersState {
  switch (action.type) {
    case "setFriends": return { ...state, friends: action.friends };
    case "setFriendSearch": return { ...state, friendSearch: action.search };
    case "setSelectedFriendId": return { ...state, selectedFriendId: action.id };
    case "setPermissionLevel": return { ...state, permissionLevel: action.level };
    case "setInviteError": return { ...state, inviteError: action.error };
    case "setMemberError": return { ...state, memberError: action.error };
    case "setInviteBusy": return { ...state, isInviteBusy: action.busy };
    case "setInviteActionId": return { ...state, inviteActionId: action.id };
    case "setMemberActionUserId": return { ...state, memberActionUserId: action.id };
    case "setMembershipDialog": return { ...state, membershipDialog: action.dialog };
    case "tickNow": return { ...state, now: Date.now() };
    default: return state;
  }
}

function MembersTab() {
  const router = useRouter();
  const t = useTranslations("collaboration");
  const commonT = useTranslations("common");
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  const formatTimestamp = useFormatTimestamp();

  const [state, dispatch] = useReducer(
    membersReducer,
    {
      friends: [],
      friendSearch: "",
      selectedFriendId: "",
      permissionLevel: "2",
      inviteError: null,
      memberError: null,
      isInviteBusy: false,
      inviteActionId: null,
      memberActionUserId: null,
      membershipDialog: null,
      now: 0,
    },
    (initialState) => ({
      ...initialState,
      now: Date.now(),
    })
  );

  const deferredFriendSearch = useDeferredValue(state.friendSearch);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      dispatch({ type: "tickNow" });
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!project?.viewerAccess.canManage) return;
    let cancelled = false;
    async function loadFriends() {
      try {
        const result = await getFriends();
        if (!cancelled) dispatch({ type: "setFriends", friends: result });
      } catch (error) {
        console.error("Failed to load friends", error);
      }
    }
    void loadFriends();
    return () => { cancelled = true; };
  }, [project?.viewerAccess.canManage]);

  if (!project) return null;

  const projectId = project.metadata.id;
  const canManage = project.viewerAccess.canManage;
  const isOwner = project.currentUser.id === project.metadata.ownerId;
  const activePresence = project.presence.filter((p) => state.now - new Date(p.lastActiveAt).getTime() < ACTIVE_PRESENCE_TTL_MS);

  const inviteableFriends = state.friends.filter((friend) => {
    const alreadyCollab = project.collaborators.some((c) => c.userId === friend.id);
    const alreadyInvited = project.pendingInvites.some((i) => i.receiverUserId === friend.id);
    if (alreadyCollab || alreadyInvited) return false;
    const query = deferredFriendSearch.trim().toLowerCase();
    if (!query) return true;
    return friend.name.toLowerCase().includes(query) || friend.email.toLowerCase().includes(query);
  });

  const getPresenceLabel = (s: "viewing" | "editing") => s === "editing" ? t("presence.editing") : t("presence.viewing");
  const getRoleLabel = (r: string) => {
    if (r === "owner") return t("members.owner");
    if (r === "level-1") return t("members.level1");
    if (r === "level-2") return t("members.level2");
    if (r === "level-3") return t("members.level3");
    return r;
  };

  async function handleInviteSubmit() {
    if (!canManage || !state.selectedFriendId || state.isInviteBusy) return;
    dispatch({ type: "setInviteBusy", busy: true });
    dispatch({ type: "setInviteError", error: null });
    try {
      const result = await createProjectInvite(projectId, {
        receiverUserId: state.selectedFriendId,
        permissionLevel: Number(state.permissionLevel),
      });
      setProject(result.project);
      dispatch({ type: "setSelectedFriendId", id: "" });
      dispatch({ type: "setFriendSearch", search: "" });
    } catch (error) {
      console.error(error);
      dispatch({ type: "setInviteError", error: error instanceof Error ? error.message : t("errors.sendInvite") });
    } finally {
      dispatch({ type: "setInviteBusy", busy: false });
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!canManage) return;
    dispatch({ type: "setInviteActionId", id: inviteId });
    try {
      const result = await cancelProjectInvite(projectId, inviteId);
      setProject(result.project);
    } catch (error) {
      console.error(error);
      dispatch({ type: "setInviteError", error: t("errors.cancelInvite") });
    } finally {
      dispatch({ type: "setInviteActionId", id: null });
    }
  }

  async function handleConfirmMembershipChange() {
    if (!state.membershipDialog) return;
    dispatch({ type: "setMemberActionUserId", id: state.membershipDialog.memberUserId });
    dispatch({ type: "setMemberError", error: null });
    try {
      const result = await removeProjectMember(projectId, { memberUserId: state.membershipDialog.memberUserId });
      dispatch({ type: "setMembershipDialog", dialog: null });
      if (result.project) {
        setProject(result.project);
        return;
      }
      const nextSearchParams = new URLSearchParams({ membership: result.kind, project: result.projectName });
      router.replace(`/?${nextSearchParams.toString()}`);
    } catch (error) {
      console.error(error);
      dispatch({ type: "setMemberError", error: error instanceof Error ? error.message : t("errors.updateMembership") });
    } finally {
      dispatch({ type: "setMemberActionUserId", id: null });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)]/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("presence.title")}</p>
            <h3 className="mt-1 text-sm font-bold text-[var(--color-text)]">{t("presence.activeNow", { count: activePresence.length })}</h3>
          </div>
          <div className="rounded-full bg-[var(--color-success)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-success)]">
            {t("presence.live")}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {activePresence.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">{t("presence.empty")}</p>
          ) : (
            activePresence.map((p) => {
              const chapter = p.chapterId ? project.chapters.find((item) => item.id === p.chapterId) : null;
              return (
                <div key={p.id} className="rounded-2xl bg-[var(--color-surface)] px-3 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-text)] text-xs font-bold text-white">{getInitials(p.user.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-[var(--color-text)]">{p.user.name}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", p.state === "editing" ? "bg-amber-100 text-amber-700" : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]")}>{getPresenceLabel(p.state)}</span>
                      </div>
                      <p className="truncate text-xs text-[var(--color-text-secondary)]">{chapter ? chapter.title : t("presence.projectOverview")} • {formatTimestamp(p.lastActiveAt)}</p>
                    </div>
                    {p.state === "editing" ? <PencilLine size={16} className="text-amber-500" /> : <Eye size={16} className="text-[var(--color-accent)]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("members.title")}</p>
            <h3 className="mt-1 text-sm font-bold text-[var(--color-text)]">{t("members.peopleCount", { count: project.collaborators.length + 1 })}</h3>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <MemberCard name={isOwner ? t("members.you") : t("members.owner")} subtitle={t("members.projectOwner")} badge={t("members.owner")} accent="bg-[var(--color-text)] text-white" />
          {project.collaborators.map((c) => {
            const isSelf = c.userId === project.currentUser.id;
            const isBusy = state.memberActionUserId === c.userId;
            const action = isOwner ? (
              <button type="button" onClick={() => dispatch({ type: "setMembershipDialog", dialog: { kind: "remove", memberUserId: c.userId, memberName: c.user.name } })} disabled={isBusy} className="rounded-xl border border-[var(--color-destructive)]/25 bg-[var(--color-destructive)]/10 p-2 text-[var(--color-destructive)] transition-colors hover:bg-[var(--color-destructive)]/15 disabled:opacity-60" aria-label={t("members.removeAria", { name: c.user.name })}>
                {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            ) : isSelf ? (
              <button type="button" onClick={() => dispatch({ type: "setMembershipDialog", dialog: { kind: "leave", memberUserId: c.userId, memberName: c.user.name } })} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-destructive)]/25 bg-[var(--color-destructive)]/10 px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-destructive)] transition-colors hover:bg-[var(--color-destructive)]/15 disabled:opacity-60">
                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} {t("members.leave")}
              </button>
            ) : null;
            return <MemberCard key={c.id} name={isSelf ? t("members.you") : c.user.name} subtitle={c.user.email ?? ""} badge={getRoleLabel(c.role)} accent="bg-[var(--color-surface-alt)] text-[var(--color-text)]" action={action} />;
          })}
        </div>
        {state.memberError && !state.membershipDialog && (
          <div className="mt-3 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">{state.memberError}</div>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("invites.title")}</p>
            <h3 className="mt-1 text-sm font-bold text-[var(--color-text)]">{t("invites.waitingCount", { count: project.pendingInvites.length })}</h3>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {project.pendingInvites.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">{t("invites.empty")}</p>
          ) : (
            project.pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)]/80 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text)]">{invite.receiver.name}</p>
                    <p className="truncate text-xs text-[var(--color-text-secondary)]">{invite.receiver.email}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                      <Clock3 size={11} /> {t("invites.invitedAt", { timestamp: formatTimestamp(invite.createdAt) })}
                    </div>
                  </div>
                  {canManage && (
                    <button type="button" onClick={() => void handleCancelInvite(invite.id)} disabled={state.inviteActionId === invite.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] disabled:opacity-60">
                      {state.inviteActionId === invite.id ? t("invites.cancelling") : t("invites.cancel")}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {canManage && (
        <section className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-accent-muted)] text-[var(--color-accent)]"><UserPlus size={16} /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("invites.inviteTitle")}</p>
              <h3 className="text-sm font-bold text-[var(--color-text)]">{t("invites.inviteSubtitle")}</h3>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <input type="text" value={state.friendSearch} onChange={(e) => dispatch({ type: "setFriendSearch", search: e.target.value })} placeholder={t("invites.filterFriends")} aria-label={t("invites.filterFriends")} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-2.5 text-sm outline-none" />
            <select value={state.selectedFriendId} onChange={(e) => dispatch({ type: "setSelectedFriendId", id: e.target.value })} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm outline-none">
              <option value="">{t("invites.chooseFriend")}</option>
              {inviteableFriends.map((f) => <option key={f.id} value={f.id}>{f.name} • {f.email}</option>)}
            </select>
            <select value={state.permissionLevel} onChange={(e) => dispatch({ type: "setPermissionLevel", level: e.target.value })} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm outline-none">
              <option value="1">{t("invites.permissionLevel1")}</option>
              <option value="2">{t("invites.permissionLevel2")}</option>
              <option value="3">{t("invites.permissionLevel3")}</option>
            </select>
            <button type="button" onClick={() => void handleInviteSubmit()} disabled={!state.selectedFriendId || state.isInviteBusy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-text)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:opacity-60">
              {state.isInviteBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("invites.sendInvite")}
            </button>
            {state.inviteError && <div className="rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">{state.inviteError}</div>}
          </div>
        </section>
      )}

      <Dialog.Root open={state.membershipDialog != null} onOpenChange={(open) => { if (!state.memberActionUserId && !open) { dispatch({ type: "setMembershipDialog", dialog: null }); dispatch({ type: "setMemberError", error: null }); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/30 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
                  {state.membershipDialog?.kind === "leave" ? <LogOut size={18} /> : <Trash2 size={18} />}
                </div>
                <div>
                  <Dialog.Title className="text-xl font-bold text-[var(--color-text)]">
                    {state.membershipDialog?.kind === "leave" ? t("members.leaveDialogTitle", { projectName: project.metadata.name }) : t("members.removeDialogTitle", { memberName: state.membershipDialog?.memberName ?? t("members.memberFallback") })}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {state.membershipDialog?.kind === "leave" ? t("members.leaveDialogDescription") : t("members.removeDialogDescription", { memberName: state.membershipDialog?.memberName ?? t("members.memberFallback") })}
                  </Dialog.Description>
                </div>
              </div>
              {state.memberError && <div className="mt-4 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">{state.memberError}</div>}
              <div className="mt-8 flex items-center justify-end gap-3">
                <Dialog.Close asChild>
                  <button type="button" disabled={state.memberActionUserId != null} className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] disabled:opacity-60">{commonT("cancel")}</button>
                </Dialog.Close>
                <button type="button" onClick={() => void handleConfirmMembershipChange()} disabled={state.memberActionUserId === state.membershipDialog?.memberUserId} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-destructive)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-destructive)] disabled:opacity-60">
                  {state.memberActionUserId === state.membershipDialog?.memberUserId && <Loader2 size={16} className="animate-spin" />}
                  {state.membershipDialog?.kind === "leave" ? t("members.leaveProject") : t("members.removeMember")}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

type CommentsState = {
  isLoading: boolean;
  error: string | null;
  threadActionId: string | null;
  replyDrafts: Record<string, string>;
  filter: "open" | "resolved" | "all";
};

type CommentsAction =
  | { type: "setLoading"; isLoading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setThreadActionId"; id: string | null }
  | { type: "setReplyDraft"; threadId: string; draft: string }
  | { type: "setFilter"; filter: "open" | "resolved" | "all" };

function commentsReducer(state: CommentsState, action: CommentsAction): CommentsState {
  switch (action.type) {
    case "setLoading": return { ...state, isLoading: action.isLoading };
    case "setError": return { ...state, error: action.error };
    case "setThreadActionId": return { ...state, threadActionId: action.id };
    case "setReplyDraft": return { ...state, replyDrafts: { ...state.replyDrafts, [action.threadId]: action.draft } };
    case "setFilter": return { ...state, filter: action.filter };
    default: return state;
  }
}

function CommentsTab() {
  const t = useTranslations("collaboration");
  const project = useProjectStore((state) => state.project);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const commentThreadsByChapter = useProjectStore((state) => state.commentThreadsByChapter);
  const selectedCommentThreadId = useProjectStore((state) => state.selectedCommentThreadId);
  const setCommentThreads = useProjectStore((state) => state.setCommentThreads);
  const upsertCommentThread = useProjectStore((state) => state.upsertCommentThread);
  const setSelectedCommentThreadId = useProjectStore((state) => state.setSelectedCommentThreadId);
  const formatTimestamp = useFormatTimestamp();

  const [state, dispatch] = useReducer(commentsReducer, {
    isLoading: false,
    error: null,
    threadActionId: null,
    replyDrafts: {},
    filter: "open"
  });

  useEffect(() => {
    if (!project || !selectedChapterId) return;
    let cancelled = false;
    const projectId = project.metadata.id;
    const chapterId = selectedChapterId;
    async function loadThreads() {
      dispatch({ type: "setLoading", isLoading: true });
      dispatch({ type: "setError", error: null });
      try {
        const threads = await getChapterCommentThreads(projectId, chapterId);
        if (cancelled) return;
        startTransition(() => {
          setCommentThreads(chapterId, threads);
          if (!selectedCommentThreadId && threads[0]) setSelectedCommentThreadId(threads[0].id);
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load comment threads", error);
          dispatch({ type: "setError", error: t("errors.loadThreads") });
        }
      } finally {
        if (!cancelled) dispatch({ type: "setLoading", isLoading: false });
      }
    }
    if (!commentThreadsByChapter[chapterId]) void loadThreads();
    return () => { cancelled = true; };
  }, [project, selectedChapterId, commentThreadsByChapter, setCommentThreads, selectedCommentThreadId, setSelectedCommentThreadId, t]);

  if (!project) return null;

  const currentThreads = selectedChapterId ? (commentThreadsByChapter[selectedChapterId] ?? []) : [];
  const filteredThreads = currentThreads.filter((th) => state.filter === "all" || th.status === state.filter);
  const selectedThread = filteredThreads.find((th) => th.id === selectedCommentThreadId) ?? currentThreads.find((th) => th.id === selectedCommentThreadId) ?? filteredThreads[0] ?? null;
  const selectedChapter = selectedChapterId ? project.chapters.find((ch) => ch.id === selectedChapterId) ?? null : null;

  const getCommentFilterLabel = (f: "open" | "resolved" | "all") => {
    if (f === "open") return t("comments.filterOpen");
    if (f === "resolved") return t("comments.filterResolved");
    return t("comments.filterAll");
  };
  const getThreadStatusLabel = (s: "open" | "resolved") => s === "open" ? t("comments.filterOpen") : t("comments.filterResolved");

  async function handleReply(thread: ProjectCommentThread) {
    const reply = state.replyDrafts[thread.id]?.trim();
    if (!reply) return;
    dispatch({ type: "setThreadActionId", id: thread.id });
    dispatch({ type: "setError", error: null });
    try {
      const updated = await replyToCommentThread(project!.metadata.id, thread.id, { content: reply });
      upsertCommentThread(updated);
      dispatch({ type: "setReplyDraft", threadId: thread.id, draft: "" });
      setSelectedCommentThreadId(updated.id);
    } catch (error) {
      console.error(error);
      dispatch({ type: "setError", error: t("errors.sendReply") });
    } finally {
      dispatch({ type: "setThreadActionId", id: null });
    }
  }

  async function handleUpdateThreadStatus(thread: ProjectCommentThread, status: "open" | "resolved") {
    dispatch({ type: "setThreadActionId", id: thread.id });
    dispatch({ type: "setError", error: null });
    try {
      const updated = await updateCommentThreadStatus(project!.metadata.id, thread.id, { status });
      upsertCommentThread(updated);
      setSelectedCommentThreadId(updated.id);
    } catch (error) {
      console.error(error);
      dispatch({ type: "setError", error: t("errors.updateThread") });
    } finally {
      dispatch({ type: "setThreadActionId", id: null });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("comments.currentChapter")}</p>
            <h3 className="truncate text-sm font-bold text-[var(--color-text)]">{selectedChapter?.title ?? t("comments.chooseChapter")}</h3>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[var(--color-canvas)] px-2 py-1">
            {(["open", "resolved", "all"] as const).map((f) => (
              <button key={f} type="button" onClick={() => dispatch({ type: "setFilter", filter: f })} className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors", state.filter === f ? "bg-[var(--color-text)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]")}>
                {getCommentFilterLabel(f)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-r border-[var(--color-border)] bg-[var(--color-canvas)]/70 p-4">
          {state.isLoading ? (
            <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]"><Loader2 size={18} className="animate-spin" /></div>
          ) : filteredThreads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{selectedChapterId ? t("comments.noMatchingThreads") : t("comments.selectChapter")}</div>
          ) : (
            <div className="space-y-3">
              {filteredThreads.map((thread) => (
                <button key={thread.id} type="button" onClick={() => setSelectedCommentThreadId(thread.id)} className={cn("w-full rounded-2xl border px-4 py-4 text-left transition-colors", selectedThread?.id === thread.id ? "border-[var(--color-text)] bg-[var(--color-surface)] shadow-sm" : "border-transparent bg-[var(--color-surface)]/80 hover:border-[var(--color-border)]")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", thread.status === "open" ? "bg-amber-100 text-amber-700" : "bg-[var(--color-success)]/10 text-[var(--color-success)]")}>{getThreadStatusLabel(thread.status)}</span>
                    {thread.isDetached && <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-destructive)]">{t("comments.detached")}</span>}
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm font-semibold leading-relaxed text-[var(--color-text)]">{thread.selectedText}</p>
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{t("comments.repliesCount", { count: thread.replies.length })}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          {selectedThread ? (
            <>
              <div className="border-b border-[var(--color-border)] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("comments.selectedText")}</p>
                    <blockquote className="mt-3 rounded-2xl bg-[var(--color-canvas)] px-4 py-4 text-base leading-relaxed font-medium text-[var(--color-text)]">“{selectedThread.selectedText}”</blockquote>
                  </div>
                  <div className="flex gap-2">
                    {selectedThread.status === "open" ? (
                      <button type="button" onClick={() => void handleUpdateThreadStatus(selectedThread, "resolved")} disabled={state.threadActionId === selectedThread.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:opacity-60">{t("comments.resolve")}</button>
                    ) : (
                      <button type="button" onClick={() => void handleUpdateThreadStatus(selectedThread, "open")} disabled={state.threadActionId === selectedThread.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:opacity-60">{t("comments.reopen")}</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-4">
                  {selectedThread.replies.map((reply) => (
                    <div key={reply.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-text)] text-xs font-bold text-white">{getInitials(reply.author.name)}</div>
                          <div>
                            <p className="text-base font-bold text-[var(--color-text)]">{reply.author.name}</p>
                            <p className="text-xs text-[var(--color-text-secondary)]">{formatTimestamp(reply.createdAt)}</p>
                          </div>
                        </div>
                        {reply.authorUserId === selectedThread.authorUserId && <Check size={14} className="text-[var(--color-success)]" />}
                      </div>
                      <p className="mt-3 text-base leading-relaxed text-[var(--color-text)]">{reply.content}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] px-5 py-5">
                <label className="sr-only" htmlFor={`reply-${selectedThread.id}`}>{t("comments.replyLabel")}</label>
                <textarea id={`reply-${selectedThread.id}`} aria-label={t("comments.replyLabel")} value={state.replyDrafts[selectedThread.id] ?? ""} onChange={(e) => dispatch({ type: "setReplyDraft", threadId: selectedThread.id, draft: e.target.value })} placeholder={t("comments.replyPlaceholder")} className="min-h-[120px] w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-3.5 text-base leading-relaxed outline-none" />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{selectedThread.isDetached ? t("comments.detachedHint") : t("comments.focusHint")}</p>
                  <button type="button" onClick={() => void handleReply(selectedThread)} disabled={state.threadActionId === selectedThread.id || !(state.replyDrafts[selectedThread.id] ?? "").trim()} className="rounded-2xl bg-[var(--color-text)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:opacity-60">
                    {state.threadActionId === selectedThread.id ? t("comments.sending") : t("comments.reply")}
                  </button>
                </div>
                {state.error && <div className="mt-3 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{state.error}</div>}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--color-canvas)] text-[var(--color-text-muted)]"><MessageSquare size={24} /></div>
                <p className="mt-4 text-base font-bold text-[var(--color-text)]">{t("comments.noThreadTitle")}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{t("comments.noThreadDescription")}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CollaborationPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations("collaboration");
  const project = useProjectStore((state) => state.project);
  const [tab, setTab] = useState<"members" | "comments">("members");

  if (!project) return null;

  return (
    <aside className="flex h-full w-[460px] xl:w-[520px] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("title")}</p>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t("subtitle")}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]" aria-label={t("close")}>
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <button type="button" onClick={() => setTab("members")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors", tab === "members" ? "bg-[var(--color-text)] text-white" : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]")}>
          <Users size={15} />
          {t("tabs.members")}
        </button>
        <button type="button" onClick={() => setTab("comments")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors", tab === "comments" ? "bg-[var(--color-text)] text-white" : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]")}>
          <MessageSquare size={15} />
          {t("tabs.comments")}
        </button>
      </div>
      {tab === "members" ? <MembersTab /> : <CommentsTab />}
    </aside>
  );
}
