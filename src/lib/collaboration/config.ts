import type { ProjectData, ProjectPresence } from "@/types/project";

export const DEFAULT_COLLAB_PORT = 1234;
export const COLLABORATION_PRESENCE_ACTIVE_MS = 60_000;
export const DEVELOPMENT_COLLAB_INTERNAL_SECRET = "development-collab-internal-secret";

export function getCollaborationInternalSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.COLLAB_INTERNAL_SECRET;
  if (secret) {
    return secret;
  }

  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    throw new Error("COLLAB_INTERNAL_SECRET must be set in non-development environments");
  }

  return DEVELOPMENT_COLLAB_INTERNAL_SECRET;
}

export function isFreshProjectPresence(presence: Pick<ProjectPresence, "lastActiveAt">, now = Date.now()) {
  return now - new Date(presence.lastActiveAt).getTime() < COLLABORATION_PRESENCE_ACTIVE_MS;
}

export function shouldUseProjectLiveCollaboration(
  project: Pick<ProjectData, "collaborators" | "presence" | "currentUser" | "viewerAccess"> | null,
  selectedChapterId: string | null,
  now = Date.now(),
) {
  void now;

  if (!project || !selectedChapterId || project.viewerAccess.isPublicViewer || !project.viewerAccess.canEdit) {
    return false;
  }

  return project.collaborators.length > 0;
}
