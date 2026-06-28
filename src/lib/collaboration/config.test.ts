import {
  COLLABORATION_PRESENCE_ACTIVE_MS,
  DEVELOPMENT_COLLAB_INTERNAL_SECRET,
  getCollaborationInternalSecret,
  isFreshProjectPresence,
  isLiveCollaborationEnabled,
  shouldUseProjectCollaborationTransport,
} from "@/lib/collaboration/config";

describe("collaboration config", () => {
  it("uses a development fallback internal secret outside production", () => {
    expect(getCollaborationInternalSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv))
      .toBe(DEVELOPMENT_COLLAB_INTERNAL_SECRET);
  });

  it("requires an explicit internal secret in production", () => {
    expect(() => getCollaborationInternalSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv))
      .toThrow("COLLAB_INTERNAL_SECRET must be set in non-development environments");
  });

  it("detects fresh presence entries inside the activity window", () => {
    const now = Date.now();

    expect(isFreshProjectPresence({ lastActiveAt: new Date(now - 5_000).toISOString() }, now)).toBe(true);
    expect(isFreshProjectPresence({ lastActiveAt: new Date(now - COLLABORATION_PRESENCE_ACTIVE_MS - 1).toISOString() }, now)).toBe(false);
  });

  it("disables live collaboration transport unconditionally", () => {
    const editableProject = {
      currentUser: { id: "user-1", name: "Owner" },
      viewerAccess: {
        canView: true,
        canEdit: true,
        canManage: true,
        isOwner: true,
        isPublicViewer: false,
      },
      collaborators: [],
      presence: [],
    };

    expect(isLiveCollaborationEnabled()).toBe(false);
    expect(shouldUseProjectCollaborationTransport(editableProject, "chapter-1")).toBe(false);
    expect(shouldUseProjectCollaborationTransport(null, "chapter-1")).toBe(false);
    expect(shouldUseProjectCollaborationTransport({}, "chapter-1")).toBe(false);
  });
});
