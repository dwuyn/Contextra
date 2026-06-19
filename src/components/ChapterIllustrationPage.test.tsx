// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChapterIllustrationPage } from "@/components/ChapterIllustrationPage";

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} />,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "editor.illustration.alt") {
      return `alt:${values?.title ?? ""}`;
    }

    return key;
  },
}));

function renderIllustrationPage(
  overrides: Partial<Parameters<typeof ChapterIllustrationPage>[0]> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <ChapterIllustrationPage
        chapterTitle="Chapter One"
        projectName="Contextra"
        chapterContent="<p>Some body content</p>"
        illustration={null}
        showGenerationPanel
        canGenerate
        isGenerating={false}
        error={null}
        onFlipBack={() => undefined}
        onGenerate={async () => undefined}
        {...overrides}
      />,
    );
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("ChapterIllustrationPage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows generation controls for internal non-editors", () => {
    const { container, unmount } = renderIllustrationPage({
      canGenerate: false,
      showGenerationPanel: true,
    });

    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.textContent).toContain("editor.illustration.generateLabel");
    expect(container.textContent).toContain("editor.illustration.readOnlyHint");

    unmount();
  });

  it("hides generation controls in display-only mode for public viewers", () => {
    const { container, unmount } = renderIllustrationPage({
      canGenerate: false,
      showGenerationPanel: false,
    });

    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).not.toContain("editor.illustration.generateLabel");
    expect(container.textContent).not.toContain("editor.illustration.readOnlyHint");
    expect(container.textContent).toContain("editor.illustration.emptyTitle");

    unmount();
  });

  it("still renders the illustration itself in display-only mode", () => {
    const { container, unmount } = renderIllustrationPage({
      showGenerationPanel: false,
      illustration: {
        url: "https://example.com/chapter-cover.png",
        prompt: "Lantern-lit alley",
        model: "imagen",
        generatedAt: "2026-06-14T00:00:00.000Z",
      },
    });

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("https://example.com/chapter-cover.png");
    expect(image?.getAttribute("alt")).toBe("alt:Chapter One");

    unmount();
  });
});
