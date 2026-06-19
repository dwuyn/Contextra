import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "@/store/useProjectStore";

function resetProjectStore() {
  useProjectStore.setState((state) => ({
    ...state,
    project: null,
    selectedProjectId: null,
    selectedChapterId: null,
    activeBranchId: "",
    isGenerating: false,
    isStoryBibleOpen: false,
    pendingTitleFocusChapterId: null,
    aiCards: [],
    pendingInsertion: null,
    chapterContentCache: {},
    chapterDraftCache: {},
    pendingChapterContentReplacements: {},
    commentThreadsByChapter: {},
    selectedCommentThreadId: null,
  }));
}

describe("useProjectStore chapter content replacements", () => {
  beforeEach(() => {
    resetProjectStore();
  });

  it("keeps editor cache writes separate from authoritative replacement requests", () => {
    const store = useProjectStore.getState();

    store.setChapterContent("chapter-1", "<p>local</p>");
    expect(useProjectStore.getState().pendingChapterContentReplacements).toEqual({});

    store.replaceChapterContent("chapter-1", "<p>server</p>");

    const replacement = useProjectStore.getState().pendingChapterContentReplacements["chapter-1"];
    expect(useProjectStore.getState().chapterContentCache["chapter-1"]).toBe("<p>server</p>");
    expect(replacement?.content).toBe("<p>server</p>");

    useProjectStore.getState().consumeChapterContentReplacement("chapter-1", replacement!.nonce);
    expect(useProjectStore.getState().pendingChapterContentReplacements["chapter-1"]).toBeUndefined();
  });

  it("ignores stale replacement acknowledgements", () => {
    const store = useProjectStore.getState();

    store.replaceChapterContent("chapter-1", "<p>first</p>");
    const firstNonce = useProjectStore.getState().pendingChapterContentReplacements["chapter-1"]!.nonce;

    store.replaceChapterContent("chapter-1", "<p>second</p>");
    const replacement = useProjectStore.getState().pendingChapterContentReplacements["chapter-1"];

    useProjectStore.getState().consumeChapterContentReplacement("chapter-1", firstNonce);
    expect(useProjectStore.getState().pendingChapterContentReplacements["chapter-1"]).toEqual(replacement);
  });

  it("keeps local chapter drafts until they are explicitly cleared", () => {
    const store = useProjectStore.getState();

    store.setChapterDraft("chapter-1", {
      title: "Unsaved",
      content: "<p>draft</p>",
    });
    expect(useProjectStore.getState().chapterDraftCache["chapter-1"]).toEqual({
      title: "Unsaved",
      content: "<p>draft</p>",
    });

    store.clearChapterDraft("chapter-1");
    expect(useProjectStore.getState().chapterDraftCache["chapter-1"]).toBeUndefined();
  });
});
