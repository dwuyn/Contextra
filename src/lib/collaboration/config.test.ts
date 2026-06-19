import {
  COLLABORATION_PRESENCE_ACTIVE_MS,
  DEVELOPMENT_COLLAB_INTERNAL_SECRET,
  getCollaborationInternalSecret,
  isFreshProjectPresence,
  shouldUseProjectLiveCollaboration,
} from "@/lib/collaboration/config";

describe("collaboration config", () => {
  it("uses a development fallback internal secret outside production", () => {
    expect(getCollaborationInternalSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv))
      .toBe(DEVELOPMENT_COLLAB_INTERNAL_SECRET);
  });

  it("requires an explicit internal secret in production", () => {
    expect(() => getCollaborationInternalSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv))
      .toThrow("COLLAB_INTERNAL_SECRET must be set in production");
  });

  it("detects fresh presence entries inside the activity window", () => {
    const now = Date.now();

    expect(isFreshProjectPresence({ lastActiveAt: new Date(now - 5_000).toISOString() }, now)).toBe(true);
    expect(isFreshProjectPresence({ lastActiveAt: new Date(now - COLLABORATION_PRESENCE_ACTIVE_MS - 1).toISOString() }, now)).toBe(false);
  });

  it("enables live collaboration for editable projects with collaborators", () => {
    const now = Date.now();

    const baseProject = {
      currentUser: { id: "user-1", name: "Owner" },
      collaborators: [
        {
          id: "collab-1",
          projectId: "project-1",
          userId: "user-2",
          role: "editor",
          permissionLevel: 2,
          createdAt: new Date(now).toISOString(),
          user: { id: "user-2", name: "Collaborator" },
        },
      ],
      viewerAccess: {
        canView: true,
        canEdit: true,
        canManage: true,
        isOwner: true,
        isPublicViewer: false,
      },
      presence: [
        {
          id: "presence-1",
          projectId: "project-1",
          userId: "user-2",
          chapterId: "chapter-2",
          state: "editing" as const,
          lastActiveAt: new Date(now - 5_000).toISOString(),
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          user: { id: "user-2", name: "Collaborator" },
        },
      ],
    };

    expect(shouldUseProjectLiveCollaboration(baseProject, "chapter-1", now)).toBe(true);
    expect(shouldUseProjectLiveCollaboration({ ...baseProject, presence: [] }, "chapter-1", now)).toBe(true);
    expect(shouldUseProjectLiveCollaboration({ ...baseProject, collaborators: [] }, "chapter-1", now)).toBe(false);
    expect(shouldUseProjectLiveCollaboration(baseProject, null, now)).toBe(false);
    expect(shouldUseProjectLiveCollaboration({
      ...baseProject,
      viewerAccess: {
        ...baseProject.viewerAccess,
        canEdit: false,
      },
    }, "chapter-1", now)).toBe(false);
    expect(shouldUseProjectLiveCollaboration({
      ...baseProject,
      presence: [{
        ...baseProject.presence[0],
        userId: "user-1",
      }],
    }, "chapter-1", now)).toBe(true);
  });
});
