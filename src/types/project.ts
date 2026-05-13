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

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: string;
  memory: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
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
}

export interface ContextMemory {
  tone: string;
  audience: string;
  sharedNotes: string;
  worldRules: unknown[] | null; // Prisma Json field — null-safe, cast to string[] at point of use
}

export interface ViewerAccess {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
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
  metadata: ProjectMetadata;
  chapters: ChapterMeta[];
  characters: Character[];
  branches: Branch[];
  collaborators: Collaborator[];
  contextMemory: ContextMemory;
  viewerAccess: ViewerAccess;
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
  isPublic: true;
  role: "viewer";
}

export interface ChapterVersion {
  id: string;
  projectId: string;
  chapterId: string;
  content: string;
  createdBy: string;
  createdAt: string;
}
