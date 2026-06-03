"use client";

import { startTransition, useDeferredValue, useEffect, useState, type ReactNode } from "react";
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

export function CollaborationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const t = useTranslations("collaboration");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const project = useProjectStore((state) => state.project);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const commentThreadsByChapter = useProjectStore((state) => state.commentThreadsByChapter);
  const selectedCommentThreadId = useProjectStore((state) => state.selectedCommentThreadId);
  const setProject = useProjectStore((state) => state.setProject);
  const setCommentThreads = useProjectStore((state) => state.setCommentThreads);
  const upsertCommentThread = useProjectStore((state) => state.upsertCommentThread);
  const setSelectedCommentThreadId = useProjectStore((state) => state.setSelectedCommentThreadId);

  const [tab, setTab] = useState<"members" | "comments">("members");
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const deferredFriendSearch = useDeferredValue(friendSearch);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [permissionLevel, setPermissionLevel] = useState("2");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [isInviteBusy, setIsInviteBusy] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [threadActionId, setThreadActionId] = useState<string | null>(null);
  const [memberActionUserId, setMemberActionUserId] = useState<string | null>(null);
  const [membershipDialog, setMembershipDialog] = useState<MembershipDialogState>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [commentFilter, setCommentFilter] = useState<"open" | "resolved" | "all">("open");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!project?.viewerAccess.canManage) return;

    let cancelled = false;

    async function loadFriends() {
      try {
        const result = await getFriends();
        if (!cancelled) {
          setFriends(result);
        }
      } catch (error) {
        console.error("Failed to load friends for invites", error);
      }
    }

    void loadFriends();

    return () => {
      cancelled = true;
    };
  }, [project?.viewerAccess.canManage]);

  const currentThreads = selectedChapterId ? (commentThreadsByChapter[selectedChapterId] ?? []) : [];

  useEffect(() => {
    if (!project || !selectedChapterId || tab !== "comments") return;

    let cancelled = false;
    const projectId = project.metadata.id;
    const chapterId = selectedChapterId;

    async function loadThreads() {
      setIsLoadingComments(true);
      setCommentError(null);
      try {
        const threads = await getChapterCommentThreads(projectId, chapterId);
        if (cancelled) return;
        startTransition(() => {
          setCommentThreads(chapterId, threads);
          if (!selectedCommentThreadId && threads[0]) {
            setSelectedCommentThreadId(threads[0].id);
          }
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load comment threads", error);
          setCommentError(t("errors.loadThreads"));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingComments(false);
        }
      }
    }

    if (!commentThreadsByChapter[chapterId]) {
      void loadThreads();
    }

    return () => {
      cancelled = true;
    };
  }, [
    project,
    selectedChapterId,
    tab,
    commentThreadsByChapter,
    setCommentThreads,
    selectedCommentThreadId,
    setSelectedCommentThreadId,
    t,
  ]);

  if (!project) return null;

  const localeTag = locale === "vi" ? "vi-VN" : "en-US";
  const formatTimestamp = (value: string | Date) =>
    new Intl.DateTimeFormat(localeTag, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }).format(new Date(value));

  const getPresenceLabel = (state: "viewing" | "editing") =>
    state === "editing" ? t("presence.editing") : t("presence.viewing");

  const getRoleLabel = (role: string) => {
    if (role === "owner") return t("members.owner");
    if (role === "level-1") return t("members.level1");
    if (role === "level-2") return t("members.level2");
    if (role === "level-3") return t("members.level3");
    return role;
  };

  const getCommentFilterLabel = (filter: "open" | "resolved" | "all") => {
    if (filter === "open") return t("comments.filterOpen");
    if (filter === "resolved") return t("comments.filterResolved");
    return t("comments.filterAll");
  };

  const getThreadStatusLabel = (status: "open" | "resolved") =>
    status === "open" ? t("comments.filterOpen") : t("comments.filterResolved");

  const projectId = project.metadata.id;
  const canManage = project.viewerAccess.canManage;
  const isOwner = project.currentUser.id === project.metadata.ownerId;
  const activePresence = project.presence.filter((presence) => {
    return now - new Date(presence.lastActiveAt).getTime() < ACTIVE_PRESENCE_TTL_MS;
  });

  const inviteableFriends = friends.filter((friend) => {
    const alreadyCollaborator = project.collaborators.some((collaborator) => collaborator.userId === friend.id);
    const alreadyInvited = project.pendingInvites.some((invite) => invite.receiverUserId === friend.id);
    if (alreadyCollaborator || alreadyInvited) return false;

    const query = deferredFriendSearch.trim().toLowerCase();
    if (!query) return true;
    return friend.name.toLowerCase().includes(query) || friend.email.toLowerCase().includes(query);
  });

  const filteredThreads = currentThreads.filter((thread) => {
    if (commentFilter === "all") return true;
    return thread.status === commentFilter;
  });

  const selectedThread =
    filteredThreads.find((thread) => thread.id === selectedCommentThreadId) ??
    currentThreads.find((thread) => thread.id === selectedCommentThreadId) ??
    filteredThreads[0] ??
    null;

  const selectedChapter = selectedChapterId
    ? project.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null
    : null;

  async function handleInviteSubmit() {
    if (!canManage || !selectedFriendId || isInviteBusy) return;

    setIsInviteBusy(true);
    setInviteError(null);
    try {
      const result = await createProjectInvite(projectId, {
        receiverUserId: selectedFriendId,
        permissionLevel: Number(permissionLevel),
      });
      setProject(result.project);
      setSelectedFriendId("");
      setFriendSearch("");
    } catch (error) {
      console.error("Failed to create project invite", error);
      setInviteError(error instanceof Error ? error.message : t("errors.sendInvite"));
    } finally {
      setIsInviteBusy(false);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!canManage) return;

    setThreadActionId(inviteId);
    try {
      const result = await cancelProjectInvite(projectId, inviteId);
      setProject(result.project);
    } catch (error) {
      console.error("Failed to cancel invite", error);
      setInviteError(t("errors.cancelInvite"));
    } finally {
      setThreadActionId(null);
    }
  }

  function openRemoveMemberDialog(memberUserId: string, memberName: string) {
    setMemberError(null);
    setMembershipDialog({ kind: "remove", memberUserId, memberName });
  }

  function openLeaveProjectDialog(memberUserId: string, memberName: string) {
    setMemberError(null);
    setMembershipDialog({ kind: "leave", memberUserId, memberName });
  }

  async function handleConfirmMembershipChange() {
    if (!membershipDialog) return;

    setMemberActionUserId(membershipDialog.memberUserId);
    setMemberError(null);

    try {
      const result = await removeProjectMember(projectId, {
        memberUserId: membershipDialog.memberUserId,
      });

      setMembershipDialog(null);

      if (result.project) {
        setProject(result.project);
        return;
      }

      const nextSearchParams = new URLSearchParams({
        membership: result.kind,
        project: result.projectName,
      });
      router.replace(`/?${nextSearchParams.toString()}`);
    } catch (error) {
      console.error("Failed to change project membership", error);
      setMemberError(error instanceof Error ? error.message : t("errors.updateMembership"));
    } finally {
      setMemberActionUserId(null);
    }
  }

  async function handleReply(thread: ProjectCommentThread) {
    const reply = replyDrafts[thread.id]?.trim();
    if (!reply) return;

    setThreadActionId(thread.id);
    setCommentError(null);
    try {
      const updated = await replyToCommentThread(projectId, thread.id, { content: reply });
      upsertCommentThread(updated);
      setReplyDrafts((drafts) => ({ ...drafts, [thread.id]: "" }));
      setSelectedCommentThreadId(updated.id);
    } catch (error) {
      console.error("Failed to reply to thread", error);
      setCommentError(t("errors.sendReply"));
    } finally {
      setThreadActionId(null);
    }
  }

  async function handleUpdateThreadStatus(thread: ProjectCommentThread, status: "open" | "resolved") {
    setThreadActionId(thread.id);
    setCommentError(null);
    try {
      const updated = await updateCommentThreadStatus(projectId, thread.id, { status });
      upsertCommentThread(updated);
      setSelectedCommentThreadId(updated.id);
    } catch (error) {
      console.error("Failed to update thread status", error);
      setCommentError(t("errors.updateThread"));
    } finally {
      setThreadActionId(null);
    }
  }

  return (
    <aside className="flex h-full w-[380px] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("title")}</p>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t("subtitle")}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <button
          type="button"
          onClick={() => setTab("members")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
            tab === "members" ? "bg-[var(--color-text)] text-white" : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]",
          )}
        >
          <Users size={15} />
          {t("tabs.members")}
        </button>
        <button
          type="button"
          onClick={() => setTab("comments")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
            tab === "comments" ? "bg-[var(--color-text)] text-white" : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]",
          )}
        >
          <MessageSquare size={15} />
          {t("tabs.comments")}
        </button>
      </div>

      {tab === "members" ? (
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
                <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                  {t("presence.empty")}
                </p>
              ) : (
                activePresence.map((presence) => {
                  const chapter = presence.chapterId
                    ? project.chapters.find((item) => item.id === presence.chapterId)
                    : null;
                  return (
                    <div key={presence.id} className="rounded-2xl bg-[var(--color-surface)] px-3 py-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-text)] text-xs font-bold text-white">
                          {getInitials(presence.user.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-[var(--color-text)]">{presence.user.name}</p>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                presence.state === "editing"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
                              )}
                            >
                              {getPresenceLabel(presence.state)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-[var(--color-text-secondary)]">
                            {chapter ? `${chapter.title}` : t("presence.projectOverview")} • {formatTimestamp(presence.lastActiveAt)}
                          </p>
                        </div>
                        {presence.state === "editing" ? (
                          <PencilLine size={16} className="text-amber-500" />
                        ) : (
                          <Eye size={16} className="text-[var(--color-accent)]" />
                        )}
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
              <MemberCard
                name={project.currentUser.id === project.metadata.ownerId ? t("members.you") : t("members.owner")}
                subtitle={t("members.projectOwner")}
                badge={t("members.owner")}
                accent="bg-[var(--color-text)] text-white"
              />
              {project.collaborators.map((collaborator) => {
                const isSelf = collaborator.userId === project.currentUser.id;
                const isBusy = memberActionUserId === collaborator.userId;
                const action = isOwner ? (
                  <button
                    type="button"
                    onClick={() => openRemoveMemberDialog(collaborator.userId, collaborator.user.name)}
                    disabled={isBusy}
                    className="rounded-xl border border-[var(--color-destructive)]/25 bg-[var(--color-destructive)]/10 p-2 text-[var(--color-destructive)] transition-colors hover:bg-[var(--color-destructive)]/15 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={t("members.removeAria", { name: collaborator.user.name })}
                  >
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                ) : isSelf ? (
                  <button
                    type="button"
                    onClick={() => openLeaveProjectDialog(collaborator.userId, collaborator.user.name)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-destructive)]/25 bg-[var(--color-destructive)]/10 px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-destructive)] transition-colors hover:bg-[var(--color-destructive)]/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                    {t("members.leave")}
                  </button>
                ) : null;

                return (
                  <MemberCard
                    key={collaborator.id}
                    name={isSelf ? t("members.you") : collaborator.user.name}
                    subtitle={collaborator.user.email ?? ""}
                    badge={getRoleLabel(collaborator.role)}
                    accent="bg-[var(--color-surface-alt)] text-[var(--color-text)]"
                    action={action}
                  />
                );
              })}
            </div>
            {memberError && !membershipDialog && (
              <div className="mt-3 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">
                {memberError}
              </div>
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
                <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                  {t("invites.empty")}
                </p>
              ) : (
                project.pendingInvites.map((invite) => (
                  <div key={invite.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)]/80 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--color-text)]">{invite.receiver.name}</p>
                        <p className="truncate text-xs text-[var(--color-text-secondary)]">{invite.receiver.email}</p>
                        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                          <Clock3 size={11} />
                          {t("invites.invitedAt", { timestamp: formatTimestamp(invite.createdAt) })}
                        </div>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void handleCancelInvite(invite.id)}
                          disabled={threadActionId === invite.id}
                          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {threadActionId === invite.id ? t("invites.cancelling") : t("invites.cancel")}
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
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-accent-muted)] text-[var(--color-accent)]">
                  <UserPlus size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("invites.inviteTitle")}</p>
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{t("invites.inviteSubtitle")}</h3>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(event) => setFriendSearch(event.target.value)}
                  placeholder={t("invites.filterFriends")}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-border)]"
                />
                <select
                  value={selectedFriendId}
                  onChange={(event) => setSelectedFriendId(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-border)]"
                >
                  <option value="">{t("invites.chooseFriend")}</option>
                  {inviteableFriends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.name} • {friend.email}
                    </option>
                  ))}
                </select>
                <select
                  value={permissionLevel}
                  onChange={(event) => setPermissionLevel(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-border)]"
                >
                  <option value="1">{t("invites.permissionLevel1")}</option>
                  <option value="2">{t("invites.permissionLevel2")}</option>
                  <option value="3">{t("invites.permissionLevel3")}</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleInviteSubmit()}
                  disabled={!selectedFriendId || isInviteBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-text)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isInviteBusy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {t("invites.sendInvite")}
                </button>
                {inviteError && (
                  <div className="rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">
                    {inviteError}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("comments.currentChapter")}</p>
                <h3 className="truncate text-sm font-bold text-[var(--color-text)]">
                  {selectedChapter?.title ?? t("comments.chooseChapter")}
                </h3>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[var(--color-canvas)] px-2 py-1">
                {(["open", "resolved", "all"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setCommentFilter(filter)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                      commentFilter === filter ? "bg-[var(--color-text)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
                    )}
                  >
                    {getCommentFilterLabel(filter)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
            <div className="border-r border-[var(--color-border)] bg-[var(--color-canvas)]/70 p-3">
              {isLoadingComments ? (
                <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-5 text-center text-xs text-[var(--color-text-muted)]">
                  {selectedChapterId ? t("comments.noMatchingThreads") : t("comments.selectChapter")}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredThreads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedCommentThreadId(thread.id)}
                      className={cn(
                        "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                        selectedThread?.id === thread.id
                          ? "border-[var(--color-text)] bg-[var(--color-surface)] shadow-sm"
                          : "border-transparent bg-[var(--color-surface)]/80 hover:border-[var(--color-border)]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            thread.status === "open" ? "bg-amber-100 text-amber-700" : "bg-[var(--color-success)]/10 text-[var(--color-success)]",
                          )}
                        >
                          {getThreadStatusLabel(thread.status)}
                        </span>
                        {thread.isDetached && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-destructive)]">{t("comments.detached")}</span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs font-semibold text-[var(--color-text)]">{thread.selectedText}</p>
                      <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
                        {t("comments.repliesCount", { count: thread.replies.length })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col">
              {selectedThread ? (
                <>
                  <div className="border-b border-[var(--color-border)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{t("comments.selectedText")}</p>
                        <blockquote className="mt-2 rounded-2xl bg-[var(--color-canvas)] px-3 py-3 text-sm font-medium text-[var(--color-text)]">
                          “{selectedThread.selectedText}”
                        </blockquote>
                      </div>
                      <div className="flex gap-2">
                        {selectedThread.status === "open" ? (
                          <button
                            type="button"
                            onClick={() => void handleUpdateThreadStatus(selectedThread, "resolved")}
                            disabled={threadActionId === selectedThread.id}
                            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t("comments.resolve")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleUpdateThreadStatus(selectedThread, "open")}
                            disabled={threadActionId === selectedThread.id}
                            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t("comments.reopen")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="space-y-3">
                      {selectedThread.replies.map((reply) => (
                        <div key={reply.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[var(--color-text)] text-[11px] font-bold text-white">
                                {getInitials(reply.author.name)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[var(--color-text)]">{reply.author.name}</p>
                                <p className="text-[11px] text-[var(--color-text-secondary)]">{formatTimestamp(reply.createdAt)}</p>
                              </div>
                            </div>
                            {reply.authorUserId === selectedThread.authorUserId && (
                              <Check size={14} className="text-[var(--color-success)]" />
                            )}
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-[var(--color-text)]">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[var(--color-border)] px-4 py-4">
                    <label className="sr-only" htmlFor={`reply-${selectedThread.id}`}>
                      {t("comments.replyLabel")}
                    </label>
                    <textarea
                      id={`reply-${selectedThread.id}`}
                      value={replyDrafts[selectedThread.id] ?? ""}
                      onChange={(event) =>
                        setReplyDrafts((drafts) => ({ ...drafts, [selectedThread.id]: event.target.value }))
                      }
                      placeholder={t("comments.replyPlaceholder")}
                      className="min-h-[90px] w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--color-border)]"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        {selectedThread.isDetached ? t("comments.detachedHint") : t("comments.focusHint")}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleReply(selectedThread)}
                        disabled={threadActionId === selectedThread.id || !(replyDrafts[selectedThread.id] ?? "").trim()}
                        className="rounded-2xl bg-[var(--color-text)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {threadActionId === selectedThread.id ? t("comments.sending") : t("comments.reply")}
                      </button>
                    </div>
                    {commentError && (
                      <div className="mt-3 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">
                        {commentError}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center px-8 text-center">
                  <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--color-canvas)] text-[var(--color-text-muted)]">
                      <MessageSquare size={24} />
                    </div>
                    <p className="mt-4 text-sm font-bold text-[var(--color-text)]">{t("comments.noThreadTitle")}</p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                      {t("comments.noThreadDescription")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog.Root
        open={membershipDialog != null}
        onOpenChange={(open) => {
          if (memberActionUserId) return;
          if (!open) {
            setMembershipDialog(null);
            setMemberError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/30 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
                  {membershipDialog?.kind === "leave" ? <LogOut size={18} /> : <Trash2 size={18} />}
                </div>
                <div>
                  <Dialog.Title className="text-xl font-bold text-[var(--color-text)]">
                  {membershipDialog?.kind === "leave"
                      ? t("members.leaveDialogTitle", { projectName: project.metadata.name })
                      : t("members.removeDialogTitle", { memberName: membershipDialog?.memberName ?? t("members.memberFallback") })}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {membershipDialog?.kind === "leave"
                      ? t("members.leaveDialogDescription")
                      : t("members.removeDialogDescription", { memberName: membershipDialog?.memberName ?? t("members.memberFallback") })}
                  </Dialog.Description>
                </div>
              </div>

              {memberError && (
                <div className="mt-4 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">
                  {memberError}
                </div>
              )}

              <div className="mt-8 flex items-center justify-end gap-3">
                <Dialog.Close asChild>
                  <button
                    type="button"
                  disabled={memberActionUserId != null}
                  className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {commonT("cancel")}
                </button>
              </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void handleConfirmMembershipChange()}
                  disabled={memberActionUserId === membershipDialog?.memberUserId}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-destructive)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-destructive)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberActionUserId === membershipDialog?.memberUserId && <Loader2 size={16} className="animate-spin" />}
                  {membershipDialog?.kind === "leave" ? t("members.leaveProject") : t("members.removeMember")}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
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
