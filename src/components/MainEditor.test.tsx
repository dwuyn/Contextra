// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/actions/projects", () => ({
  createCommentThread: vi.fn(),
  getChapterContent: vi.fn(),
  saveCollaborativeChapter: vi.fn().mockResolvedValue({
    status: "saved",
    continuity: { fresh: true },
    contentChanged: true,
    updatedAt: "2026-06-25T10:00:00.000Z",
  }),
  updateChapter: vi.fn().mockResolvedValue({
    status: "saved",
    continuity: { fresh: true },
    contentChanged: true,
    updatedAt: "2026-06-25T10:00:00.000Z",
  }),
}));

vi.mock("@/actions/ai", () => ({
  rewriteAction: vi.fn(),
  describeAction: vi.fn(),
}));

vi.mock("@/actions/export", () => ({
  exportProjectAction: vi.fn(),
}));

vi.mock("@/services/promptLanguageService", () => ({
  resolvePromptLanguage: vi.fn(() => "English"),
}));

vi.mock("@/lib/tiptap/chapterEditorExtensions", () => ({
  createChapterEditorExtensions: vi.fn(() => []),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      "editor.placeholder": "Start writing...",
      "editor.emptyChapter": "Empty chapter",
      "editor.loading": "Loading editor...",
      "editor.status.saved": "Saved",
      "editor.status.saving": "Saving...",
      "editor.status.unsavedChanges": "Unsaved changes",
      "editor.status.autosavedCheckpointPending": "Checkpoint pending",
      "editor.status.saveFailed": "Save failed",
      "editor.saveCheckpoint": "Save checkpoint",
      "editor.conflict.title": "Save conflict",
      "editor.conflict.description": "This chapter was modified by another session.",
      "editor.conflict.copyText": "Copy your text",
      "editor.conflict.reloadLatest": "Reload latest",
      "editor.ai.write": "Write",
      "editor.ai.rewrite": "Rewrite",
      "editor.ai.describe": "Describe",
      "editor.ai.brainstorm": "Brainstorm",
      "editor.chapterTitle": "Chapter title",
      "editor.comment.comment": "Comment",
      "editor.illustration.flip": "Flip",
      "editor.untitledChapter": "Untitled Chapter",
      "workspace.exportMarkdown": "Export markdown",
      "zen.enter": "Zen mode",
    };
    return translations[key] ?? key;
  },
}));

let providerConstructorCount = 0;

vi.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: class {
    constructor() {
      providerConstructorCount += 1;
    }
  },
}));

let latestEditorConfig: EditorConfig | null = null;
const mockSetContent = vi.fn();
const mockGetHTML = vi.fn(() => "<p>Initial draft</p>");
const mockEditorInstance = {
  getHTML: mockGetHTML,
  getText: vi.fn(() => "Initial draft"),
  setEditable: vi.fn(),
  commands: {
    setContent: mockSetContent,
  },
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      insertContent: vi.fn(() => ({
        setAiGenerated: vi.fn(() => ({
          run: vi.fn(),
        })),
      })),
    })),
    setTextSelection: vi.fn(() => ({
      setCommentAnchor: vi.fn(() => ({
        run: vi.fn(),
      })),
    })),
  })),
  state: {
    selection: { empty: true, from: 1, to: 1 },
    doc: {
      textBetween: vi.fn(() => ""),
      content: { size: 0 },
    },
  },
  view: {
    dom: {
      querySelectorAll: vi.fn(() => []),
    },
  },
  storage: {
    characterCount: {
      words: () => 10,
      characters: () => 50,
    },
  },
};

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn((config) => {
    latestEditorConfig = config;
    return mockEditorInstance;
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: { children: ReactNode }) => <div data-testid="bubble-menu">{children}</div>,
}));

vi.mock("@/components/EditorFormattingToolbar", () => ({
  EditorFormattingToolbar: () => <div data-testid="formatting-toolbar" />,
}));

vi.mock("@/components/ChapterIllustrationPage", () => ({
  ChapterIllustrationPage: () => <div data-testid="illustration-page" />,
}));

vi.mock("@/components/PublicVoiceReader", () => ({
  PublicVoiceReader: () => <div data-testid="voice-reader" />,
}));

import { MainEditor } from "./MainEditor";
import { saveCollaborativeChapter, updateChapter } from "@/actions/projects";
import { useProjectStore } from "@/store/useProjectStore";
import type { ProjectData } from "@/types/project";

type EditorConfig = {
  onBlur: () => void;
  onUpdate: (params: { editor: typeof mockEditorInstance }) => void;
};

function buildProject(chapters: ProjectData["chapters"] = [
  {
    id: "chap-1",
    projectId: "proj-1",
    branchId: "branch-1",
    title: "Chapter One",
    summary: "",
    index: 0,
    source: "manual",
    illustration: null,
    createdAt: "2026-06-25T09:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
  },
]): ProjectData {
  return {
    currentUser: { id: "user-1", name: "User One" },
    metadata: {
      id: "proj-1",
      ownerId: "user-1",
      name: "Project One",
      mode: "novel",
      genre: "fantasy",
      summary: "A summary",
      isPublic: false,
      createdAt: "2026-06-25T09:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
    },
    chapters,
    characters: [],
    canonProposals: [],
    storyArcs: [],
    outlineBeats: [],
    branches: [
      {
        id: "branch-1",
        projectId: "proj-1",
        name: "Main",
        description: "",
        status: "active",
        highlights: [],
        createdAt: "2026-06-25T09:00:00.000Z",
      },
    ],
    collaborators: [],
    pendingInvites: [],
    presence: [],
    chapterCommentCounts: [],
    contextMemory: {
      tone: "",
      audience: "",
      sharedNotes: "",
      worldRules: {},
    },
    outline: { acts: [] },
    viewerAccess: {
      canView: true,
      canEdit: true,
      canManage: true,
      isPublicViewer: false,
    },
    aiMessages: [],
    chatMessages: [],
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("MainEditor", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0);
    }
    if (!window.cancelAnimationFrame) {
      window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    providerConstructorCount = 0;
    latestEditorConfig = null as EditorConfig | null;
    mockGetHTML.mockReturnValue("<p>Initial draft</p>");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    useProjectStore.setState({
      project: buildProject(),
      selectedProjectId: "proj-1",
      selectedChapterId: "chap-1",
      activeBranchId: "branch-1",
      isGenerating: false,
      pendingInsertion: null,
      chapterContentCache: { "chap-1": "<p>Cached chapter</p>" },
      chapterDraftCache: {},
      pendingChapterContentReplacements: {},
      selectedCommentThreadId: null,
      pendingTitleFocusChapterId: null,
      setChapterDraft: vi.fn(),
      clearChapterDraft: vi.fn(),
      setChapterContent: vi.fn(),
      updateChapterMetaLocally: vi.fn(),
      consumeChapterContentReplacement: vi.fn(),
      upsertCommentThread: vi.fn(),
      setSelectedCommentThreadId: vi.fn(),
      createAiCard: vi.fn(() => "card-1"),
      updateAiCard: vi.fn(),
      clearPendingInsertion: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("never requests /api/collab/session and never instantiates HocuspocusProvider", async () => {
    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    expect(providerConstructorCount).toBe(0);
    expect(
      fetchMock.mock.calls.some(([url]) => typeof url === "string" && url.includes("/api/collab/session")),
    ).toBe(false);
  });

  it("saves through updateChapter on blur and never calls saveCollaborativeChapter", async () => {
    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    mockGetHTML.mockReturnValue("<p>Updated draft</p>");
    act(() => {
      latestEditorConfig.onUpdate({ editor: mockEditorInstance });
      latestEditorConfig.onBlur();
    });
    await flush();

    expect(updateChapter).toHaveBeenCalledWith(
      "proj-1",
      "chap-1",
      expect.objectContaining({
        title: "Chapter One",
        content: "<p>Updated draft</p>",
        createVersion: false,
        revalidate: false,
        expectedUpdatedAt: "2026-06-25T10:00:00.000Z",
      }),
    );
    expect(saveCollaborativeChapter).not.toHaveBeenCalled();
  });

  it("updates the local chapter metadata with the saved timestamp after a successful save", async () => {
    vi.mocked(updateChapter).mockResolvedValueOnce({
      status: "saved",
      continuity: { fresh: true },
      contentChanged: true,
      updatedAt: "2026-06-25T10:05:00.000Z",
    });

    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    mockGetHTML.mockReturnValue("<p>Updated draft</p>");
    act(() => {
      latestEditorConfig.onUpdate({ editor: mockEditorInstance });
      latestEditorConfig.onBlur();
    });
    await flush();

    expect(useProjectStore.getState().updateChapterMetaLocally).toHaveBeenCalledWith(
      "chap-1",
      expect.objectContaining({
        updatedAt: "2026-06-25T10:05:00.000Z",
      }),
    );
  });

  it("autosaves after 1 second", async () => {
    vi.useFakeTimers();

    try {
      act(() => {
        root.render(<MainEditor />);
      });
      await flush();

      mockGetHTML.mockReturnValue("<p>Autosaved draft</p>");
      act(() => {
        latestEditorConfig.onUpdate({ editor: mockEditorInstance });
      });

      expect(updateChapter).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(999);
        await Promise.resolve();
      });
      expect(updateChapter).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });

      expect(updateChapter).toHaveBeenCalledWith(
        "proj-1",
        "chap-1",
        expect.objectContaining({
          title: "Chapter One",
          content: "<p>Autosaved draft</p>",
          createVersion: false,
          revalidate: false,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the keepalive save payload on the normal-save contract", async () => {
    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    mockGetHTML.mockReturnValue("<p>Unsaved change</p>");
    act(() => {
      latestEditorConfig.onUpdate({ editor: mockEditorInstance });
    });

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();

    const saveCall = fetchMock.mock.calls.find(([url]) => typeof url === "string" && url.includes("/save"));
    expect(saveCall).toBeTruthy();
    const payload = JSON.parse((saveCall?.[1] as RequestInit).body as string);
    expect(payload).toEqual({
      title: "Chapter One",
      content: "<p>Unsaved change</p>",
      expectedUpdatedAt: "2026-06-25T10:00:00.000Z",
    });
    expect(payload).not.toHaveProperty("isCollaborative");
  });

  it("only issues one keepalive save when both visibilitychange and pagehide fire", async () => {
    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    mockGetHTML.mockReturnValue("<p>Unsaved change</p>");
    act(() => {
      latestEditorConfig.onUpdate({ editor: mockEditorInstance });
    });

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));
    });
    await flush();

    const saveCalls = fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.includes("/save"));
    expect(saveCalls).toHaveLength(1);
  });

  it("renders the conflict UI when the normal save returns a stale-write conflict", async () => {
    vi.mocked(updateChapter).mockResolvedValueOnce({
      status: "conflict",
      latest: {
        title: "Remote Title",
        summary: "",
        content: "<p>remote</p>",
        updatedAt: "2026-06-25T10:05:00.000Z",
      },
    });

    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    mockGetHTML.mockReturnValue("<p>Local change</p>");
    act(() => {
      latestEditorConfig.onUpdate({ editor: mockEditorInstance });
      latestEditorConfig.onBlur();
    });
    await flush();

    expect(container.textContent).toContain("Save conflict");
  });

  it("loads the next chapter without waiting for the previous chapter save to finish", async () => {
    let resolveSave: ((value: Awaited<ReturnType<typeof updateChapter>>) => void) | null = null;
    vi.mocked(updateChapter).mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    fetchMock.mockImplementation(async (input) => {
      if (typeof input === "string" && input.includes("/chapters/chap-2/content")) {
        return {
          ok: true,
          json: async () => ({
            title: "Chapter Two",
            content: "<p>Loaded chapter two</p>",
            updatedAt: "2026-06-25T10:10:00.000Z",
          }),
          text: async () => "",
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
        text: async () => "",
      } as Response;
    });

    useProjectStore.setState({
      project: buildProject([
        {
          id: "chap-1",
          projectId: "proj-1",
          branchId: "branch-1",
          title: "Chapter One",
          summary: "",
          index: 0,
          source: "manual",
          illustration: null,
          createdAt: "2026-06-25T09:00:00.000Z",
          updatedAt: "2026-06-25T10:00:00.000Z",
        },
        {
          id: "chap-2",
          projectId: "proj-1",
          branchId: "branch-1",
          title: "Chapter Two",
          summary: "",
          index: 1,
          source: "manual",
          illustration: null,
          createdAt: "2026-06-25T09:05:00.000Z",
          updatedAt: "2026-06-25T10:01:00.000Z",
        },
      ]),
      selectedProjectId: "proj-1",
      selectedChapterId: "chap-1",
      activeBranchId: "branch-1",
      chapterContentCache: { "chap-1": "<p>Cached chapter</p>" },
    });

    act(() => {
      root.render(<MainEditor />);
    });
    await flush();

    mockGetHTML.mockReturnValue("<p>Pending save</p>");
    act(() => {
      latestEditorConfig.onUpdate({ editor: mockEditorInstance });
    });

    act(() => {
      useProjectStore.getState().setSelectedChapterId("chap-2");
    });
    await flush();

    expect(updateChapter).toHaveBeenCalledWith(
      "proj-1",
      "chap-1",
      expect.objectContaining({
        content: "<p>Pending save</p>",
      }),
    );
    expect(
      fetchMock.mock.calls.some(([url]) => typeof url === "string" && url.includes("/chapters/chap-2/content")),
    ).toBe(true);

    resolveSave?.({
      status: "saved",
      continuity: { fresh: true },
      contentChanged: true,
      updatedAt: "2026-06-25T10:05:00.000Z",
    });
    await flush();
  });
});
