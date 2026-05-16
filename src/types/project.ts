// Core project types derived from the Prisma schema
// Use these instead of `any` throughout the codebase

export interface ChapterMeta {
  id: string;
  projectId: string;
  branchId: string;
  title: string;
  summary: string;
  index: number;
  source: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OutlineChapter {
  id: string;
  title: string;
  summary: string;
}

export interface OutlineAct {
  id: string;
  title: string;
  summary: string;
  chapters: OutlineChapter[];
}

export interface ProjectOutline {
  acts: OutlineAct[];
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: string;
  memory: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface ProjectUserSummary {
  id: string;
  name: string;
  email?: string;
  profileImageUrl?: string | null;
}

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: string;
  highlights: string[] | unknown;
  parentBranchId?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown; // allow extra Prisma fields like basedOnChapterId
}

export interface Collaborator {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  permissionLevel: number;
  createdAt: Date | string;
  user: ProjectUserSummary;
}

export interface ProjectInvite {
  id: string;
  projectId: string;
  senderUserId: string;
  receiverUserId: string;
  permissionLevel: number;
  status: "pending" | "accepted" | "declined" | "canceled";
  createdAt: Date | string;
  updatedAt: Date | string;
  sender: ProjectUserSummary;
  receiver: ProjectUserSummary;
}

export type ProjectPresenceState = "viewing" | "editing";

export interface ProjectPresence {
  id: string;
  projectId: string;
  userId: string;
  chapterId: string | null;
  state: ProjectPresenceState;
  lastActiveAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  user: ProjectUserSummary;
}

export interface ChapterCommentCount {
  chapterId: string;
  openCount: number;
  totalCount: number;
}

export interface ProjectCommentReply {
  id: string;
  threadId: string;
  authorUserId: string;
  content: string;
  createdAt: Date | string;
  author: ProjectUserSummary;
}

export type ProjectCommentThreadStatus = "open" | "resolved";

export interface ProjectCommentThread {
  id: string;
  projectId: string;
  chapterId: string;
  authorUserId: string;
  selectedText: string;
  status: ProjectCommentThreadStatus;
  resolvedAt: Date | string | null;
  resolvedByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  author: ProjectUserSummary;
  resolvedBy: ProjectUserSummary | null;
  replies: ProjectCommentReply[];
  isDetached?: boolean;
}

export interface ProjectChatMessage {
  id: string;
  projectId: string;
  senderId: string;
  content: string;
  fileName?: string | null;
  fileUrl?: string | null;
  createdAt: Date | string;
}

export interface ContextMemory {
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: unknown; // Prisma Json field; validate before iterating in UI.
}

export interface ViewerAccess {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  isPublicViewer?: boolean;
  permissionLevel?: number | null;
  role?: string;
}

export type ProjectAiMessageRole = "user" | "assistant";

export interface ProjectAiMessage {
  id: string;
  projectId: string;
  branchId: string;
  authorUserId: string | null;
  role: ProjectAiMessageRole;
  content: string;
  createdAt: Date | string;
}

export interface ProjectMetadata {
  id: string;
  ownerId: string;
  name: string;
  mode: string;
  genre: string;
  summary: string;
  isPublic: boolean;
  coverImageUrl?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProjectData {
  currentUser: ProjectUserSummary;
  metadata: ProjectMetadata;
  chapters: ChapterMeta[];
  characters: Character[];
  branches: Branch[];
  collaborators: Collaborator[];
  pendingInvites: ProjectInvite[];
  presence: ProjectPresence[];
  chapterCommentCounts: ChapterCommentCount[];
  contextMemory: ContextMemory;
  outline: ProjectOutline;
  viewerAccess: ViewerAccess;
  aiMessages: ProjectAiMessage[];
  chatMessages: ProjectChatMessage[];
}

export type ContinuityRefreshStatus =
  | { fresh: true }
  | { fresh: false; warning: string };

export interface CreateChapterResult {
  project: ProjectData;
  chapter: ChapterMeta & { content: string };
  continuity: ContinuityRefreshStatus;
}

export interface UpdateChapterResult {
  continuity: ContinuityRefreshStatus;
}

export interface RestoreVersionResult {
  content: string;
  continuity: ContinuityRefreshStatus;
}

export interface ProjectListItem {
  id: string;
  name: string;
  mode: string;
  genre: string;
  summary: string;
  updatedAt: string;
  chapterCount: number;
  activeBranches: number;
  collaboratorCount: number;
  role: string;
  isPublic: boolean;
  coverImageUrl?: string | null;
}

export interface PublicProject {
  id: string;
  name: string;
  summary: string;
  genre: string;
  ownerName: string;
  updatedAt: string;
  coverImageUrl?: string | null;
  isPublic?: boolean;
  role?: string;
}

export interface PublicProjectPage {
  items: PublicProject[];
  page: number;
  hasMore: boolean;
}

export interface PendingProjectInviteCard {
  id: string;
  projectId: string;
  projectName: string;
  projectSummary: string;
  permissionLevel: number;
  sender: ProjectUserSummary;
  createdAt: string;
}

export interface HomeOverviewData {
  recentProjects: ProjectListItem[];
  publicProjects: PublicProject[];
  pendingProjectInvites: PendingProjectInviteCard[];
}

export interface ChapterVersion {
  id: string;
  projectId: string;
  chapterId: string;
  content: string;
  createdBy: string;
  createdAt: string;
}
