import { describe, expect, it, vi, beforeEach } from "vitest";
import { server } from "./collab-server";
import * as projectService from "@/services/projectService";
import { getChapterHtmlFromYDoc, encodeChapterState } from "@/lib/collaboration/document";

vi.mock("@/services/projectService", () => ({
  saveChapterCollaborationState: vi.fn(),
  getChapterCollaborationBootstrap: vi.fn(),
  syncCollaborativeChapterContent: vi.fn(),
}));

vi.mock("@/lib/collaboration/document", async () => {
  const original = await vi.importActual<any>("@/lib/collaboration/document");
  return {
    ...original,
    getChapterHtmlFromYDoc: vi.fn(() => "<p>mocked content</p>"),
    encodeChapterState: vi.fn(() => new Uint8Array([1, 2, 3])),
  };
});

describe("collab-server stateless protocol", () => {
  let mockConnection: any;
  let mockDocument: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockConnection = {
      context: {
        chapterId: "chapter-123",
        projectId: "project-456",
        userId: "user-789",
        readOnly: false,
      },
      sendStateless: vi.fn(),
    };
    mockDocument = {};
  });

  it("handles valid chapter_snapshot_request and eagerly persists state before replying", async () => {
    const payload = JSON.stringify({
      event: "chapter_snapshot_request",
      requestId: "req-1",
    });

    const onStateless = server.configuration.onStateless;
    if (!onStateless) {
      throw new Error("onStateless hook not defined on server");
    }

    await onStateless({
      connection: mockConnection,
      documentName: "chapter:chapter-123:body",
      document: mockDocument,
      payload,
    });

    expect(projectService.saveChapterCollaborationState).toHaveBeenCalledWith(
      "project-456",
      "chapter-123",
      new Uint8Array([1, 2, 3])
    );

    expect(mockConnection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({
        event: "chapter_snapshot_response",
        requestId: "req-1",
        ok: true,
        html: "<p>mocked content</p>",
      })
    );
  });

  it("returns an error response for read-only requests", async () => {
    mockConnection.context.readOnly = true;

    const payload = JSON.stringify({
      event: "chapter_snapshot_request",
      requestId: "req-2",
    });

    const onStateless = server.configuration.onStateless;
    if (!onStateless) {
      throw new Error("onStateless hook not defined on server");
    }

    await onStateless({
      connection: mockConnection,
      documentName: "chapter:chapter-123:body",
      document: mockDocument,
      payload,
    });

    expect(projectService.saveChapterCollaborationState).not.toHaveBeenCalled();
    expect(mockConnection.sendStateless).toHaveBeenCalledWith(
      JSON.stringify({
        event: "chapter_snapshot_response",
        requestId: "req-2",
        ok: false,
        error: "Unauthorized",
      })
    );
  });

  it("returns an error response for malformed JSON request payloads containing requestId", async () => {
    const payloadInvalid = JSON.stringify({
      requestId: "req-3",
    });

    const onStateless = server.configuration.onStateless;
    if (!onStateless) {
      throw new Error("onStateless hook not defined on server");
    }

    await onStateless({
      connection: mockConnection,
      documentName: "chapter:chapter-123:body",
      document: mockDocument,
      payload: payloadInvalid,
    });

    expect(projectService.saveChapterCollaborationState).not.toHaveBeenCalled();
    expect(mockConnection.sendStateless).toHaveBeenCalledWith(
      expect.stringContaining('"ok":false')
    );
  });
});

describe("collab-server durability health monitoring", () => {
  let storeHook: any;
  let mockDocument: any;

  beforeEach(() => {
    vi.resetAllMocks();

    const dbExtension = server.configuration.extensions.find(
      (ext: any) => ext.configuration && typeof ext.configuration.store === "function"
    ) as any;
    storeHook = dbExtension.configuration.store;

    mockDocument = {
      broadcastStateless: vi.fn(),
    };
  });

  it("broadcasts chapter_persistence_warning after final retry failure (3 failed attempts)", async () => {
    (projectService.getChapterCollaborationBootstrap as any).mockResolvedValue({
      id: "chapter-123",
      projectId: "project-456",
      content: "<p>old content</p>",
      updatedAt: new Date(),
    });

    (projectService.syncCollaborativeChapterContent as any).mockRejectedValue(
      new Error("Database disconnected")
    );

    await storeHook({
      documentName: "chapter:chapter-1:body",
      state: new Uint8Array([1, 2, 3]),
      document: mockDocument,
      context: { internal: false },
    });

    expect(projectService.syncCollaborativeChapterContent).toHaveBeenCalledTimes(3);
    expect(mockDocument.broadcastStateless).toHaveBeenCalledWith(
      JSON.stringify({
        event: "chapter_persistence_warning",
        message: "Database disconnected",
      })
    );
  });

  it("broadcasts chapter_persistence_recovered when database becomes healthy after being unhealthy", async () => {
    (projectService.getChapterCollaborationBootstrap as any).mockResolvedValue({
      id: "chapter-123",
      projectId: "project-456",
      content: "<p>old content</p>",
      updatedAt: new Date(),
    });
    (projectService.syncCollaborativeChapterContent as any).mockRejectedValue(
      new Error("Database disconnected")
    );

    await storeHook({
      documentName: "chapter:chapter-2:body",
      state: new Uint8Array([1, 2, 3]),
      document: mockDocument,
      context: { internal: false },
    });

    expect(mockDocument.broadcastStateless).toHaveBeenLastCalledWith(
      JSON.stringify({
        event: "chapter_persistence_warning",
        message: "Database disconnected",
      })
    );

    (projectService.syncCollaborativeChapterContent as any).mockResolvedValue({
      ok: true,
    });
    (projectService.saveChapterCollaborationState as any).mockResolvedValue({
      ok: true,
    });

    mockDocument.broadcastStateless.mockClear();

    await storeHook({
      documentName: "chapter:chapter-2:body",
      state: new Uint8Array([1, 2, 3]),
      document: mockDocument,
      context: { internal: false },
    });

    expect(mockDocument.broadcastStateless).toHaveBeenCalledWith(
      JSON.stringify({
        event: "chapter_persistence_recovered",
      })
    );
  });
});
