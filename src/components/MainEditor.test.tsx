// @vitest-environment jsdom
import { vi, describe, expect, it, beforeEach, afterEach, beforeAll } from "vitest";

// Stub global fetch to prevent relative URL fetch parsing errors in JSDOM/node
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
}));

// Hoist mocks to the top before any component imports
vi.mock("@/actions/projects", () => ({
  getChapterContent: vi.fn().mockResolvedValue("<p>server content</p>"),
  saveCollaborativeChapter: vi.fn().mockResolvedValue({
    continuity: { fresh: true, status: "queued", warning: null },
    collaborationWarning: null,
  }),
  updateChapter: vi.fn().mockResolvedValue({
    continuity: { fresh: true, status: "queued", warning: null },
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

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      "editor.placeholder": "Write your story...",
      "editor.loading": "Loading...",
      "editor.status.saved": "Saved",
      "editor.status.saving": "Saving...",
      "editor.status.unsavedChanges": "Unsaved Changes",
      "editor.status.autosavedCheckpointPending": "Autosaved Checkpoint Pending",
      "editor.status.saveFailed": "Save failed",
      "editor.collaboration.liveOffline": "Live Offline",
      "editor.collaboration.liveSyncing": "Live Syncing...",
      "editor.saveCheckpoint": "Save Checkpoint",
    };
    return translations[key] || key;
  },
}));

const mockForceSync = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockSendStateless = vi.fn();
const mockDestroy = vi.fn();

const mockProviderInstance = {
  forceSync: mockForceSync,
  on: mockOn,
  off: mockOff,
  sendStateless: mockSendStateless,
  destroy: mockDestroy,
  hasUnsyncedChanges: false,
  awareness: {
    setLocalStateField: vi.fn(),
  },
};

vi.mock("@hocuspocus/provider", () => {
  return {
    HocuspocusProvider: class {
      constructor() {
        return mockProviderInstance;
      }
      on = mockOn;
      off = mockOff;
      destroy = mockDestroy;
      forceSync = mockForceSync;
      sendStateless = mockSendStateless;
    },
  };
});

const mockGetHTML = vi.fn(() => "<p>Hello</p>");
const mockSetContent = vi.fn();
const mockChain = vi.fn(() => ({
  focus: vi.fn(() => ({
    insertContent: vi.fn(() => ({
      setAiGenerated: vi.fn(() => ({
        run: vi.fn(),
      })),
    })),
  })),
}));

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    getHTML: mockGetHTML,
    setEditable: vi.fn(),
    commands: {
      setContent: mockSetContent,
    },
    chain: mockChain,
    state: {
      selection: { empty: true },
      doc: {
        textBetween: vi.fn(() => ""),
      },
    },
    view: {
      dom: {
        querySelectorAll: vi.fn(() => []),
      },
    },
    storage: {
      characterCount: {
        words: () => 100,
        characters: () => 500,
      },
    },
    registerPlugin: vi.fn(),
  })),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: any) => <div data-testid="bubble-menu">{children}</div>,
}));

vi.mock("./EditorFormattingToolbar", () => ({
  EditorFormattingToolbar: () => <div data-testid="formatting-toolbar" />,
}));
vi.mock("./PublicVoiceReader", () => ({
  PublicVoiceReader: () => <div data-testid="voice-reader" />,
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MainEditor } from "./MainEditor";
import { useProjectStore } from "@/store/useProjectStore";

// Setup window animation frames
beforeAll(() => {
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0);
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
  }
});

describe("MainEditor Component Hardening", () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.clearAllMocks();

    const mockProject = {
      metadata: { id: "proj-1", name: "Project One" },
      chapters: [{ id: "chap-1", title: "Chapter One" }],
      viewerAccess: { canEdit: true, isPublicViewer: false },
      collaborators: [],
    };

    useProjectStore.setState({
      project: mockProject as any,
      selectedChapterId: "chap-1",
      chapterContentCache: { "chap-1": "<p>cached content</p>" },
      chapterDraftCache: {},
      pendingChapterContentReplacements: {},
      isGenerating: false,
      pendingInsertion: null,
      updateChapterMetaLocally: vi.fn(),
      setChapterDraft: vi.fn(),
      clearChapterDraft: vi.fn(),
      setChapterContent: vi.fn(),
      consumeChapterContentReplacement: vi.fn(),
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container) {
      container.remove();
    }
    document.body.innerHTML = "";
  });

  it("renders editor successfully in initial local state", () => {
    act(() => {
      root.render(<MainEditor />);
    });
    expect(container?.textContent).toContain("Saved");
  });
});
