// Core project types derived from the Prisma schema
// Use these instead of `any` throughout the codebase

export interface ChapterIllustrationMeta {
  url: string;
  prompt: string;
  model: string;
  generatedAt: Date | string;
}

export interface ChapterMeta {
  id: string;
  projectId: string;
  branchId: string;
  title: string;
  summary: string;
  index: number;
  source: string;
  illustration: ChapterIllustrationMeta | null;
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

export type CanonProposalStatus = "pending" | "approved" | "rejected";

export interface CanonProposal {
  id: string;
  projectId: string;
  chapterId: string | null;
  branchId: string | null;
  type: string;
  payload: unknown;
  rationale: string;
  status: CanonProposalStatus;
  createdAt: Date | string;
  reviewedAt?: Date | string | null;
  reviewedByUserId?: string | null;
}

export interface CanonEntity {
  id: string;
  projectId: string;
  type: string;
  name: string;
  aliases: unknown;
  summary: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CanonFact {
  id: string;
  projectId: string;
  entityId?: string | null;
  kind: string;
  content: string;
  sourceChapterId?: string | null;
  branchId?: string | null;
  confidence: number;
  importance: number;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CanonRelation {
  id: string;
  projectId: string;
  sourceEntityId?: string | null;
  targetEntityId?: string | null;
  relationType: string;
  summary: string;
  sourceChapterId?: string | null;
  confidence: number;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StoryArc {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  startChapterIndex?: number | null;
  endChapterIndex?: number | null;
  status: string;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OutlineBeat {
  id: string;
  projectId: string;
  arcId?: string | null;
  chapterIndex?: number | null;
  title: string;
  summary: string;
  status: string;
  focusEntities: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
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
  canonProposals: CanonProposal[];
  storyArcs: StoryArc[];
  outlineBeats: OutlineBeat[];
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
  | { fresh: false; status?: "queued" | "stale"; warning: string };

export interface CreateChapterResult {
  project: ProjectData;
  chapter: ChapterMeta & { content: string };
  continuity: ContinuityRefreshStatus;
}

export interface UpdateChapterResult {
  continuity: ContinuityRefreshStatus;
  contentChanged: boolean;
  collaborationWarning?: string | null;
}

export interface ChapterSaveSuccessPayload {
  status: "saved";
  continuity: ContinuityRefreshStatus;
  contentChanged: boolean;
  updatedAt: string;
  collaborationWarning?: string | null;
}

export interface ChapterSaveConflictPayload {
  status: "conflict";
  latest: {
    title: string;
    summary: string;
    content: string;
    updatedAt: string;
  };
}

export type ChapterSavePayload = ChapterSaveSuccessPayload | ChapterSaveConflictPayload;

export interface ProjectChapterSavedEvent {
  projectId: string;
  chapterId: string;
  title: string;
  updatedAt: string;
  savedByUserId: string;
  savedByName: string;
}

export interface ProjectCollaborationSession {
  documentName: string;
  websocketUrl: string;
  token: string;
  readOnly: boolean;
  user: {
    id: string;
    name: string;
    color: string;
    profileImageUrl?: string | null;
  };
}

export interface RestoreVersionResult {
  content: string;
  continuity: ContinuityRefreshStatus;
}

export type ProjectMembershipChangeKind = "removed" | "left";

export interface RemoveProjectMemberResult {
  project: ProjectData | null;
  projectId: string;
  projectName: string;
  memberUserId: string;
  memberName: string;
  ownerUserId: string;
  kind: ProjectMembershipChangeKind;
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
