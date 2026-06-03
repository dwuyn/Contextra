// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import {
  EditorFormattingToolbar,
  type EditorFormattingToolbarLabels,
} from "@/components/EditorFormattingToolbar";

const labels: EditorFormattingToolbarLabels = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  alignLeft: "Align left",
  alignCenter: "Align center",
  alignRight: "Align right",
};

function createTestEditor(content = "<p>Hello world</p>") {
  const element = document.createElement("div");
  document.body.appendChild(element);

  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content,
  });

  return {
    editor,
    destroy() {
      editor.destroy();
      element.remove();
    },
  };
}

function renderToolbar(editor: Editor, canEdit = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(<EditorFormattingToolbar editor={editor} canEdit={canEdit} labels={labels} />);
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

function getButton(container: HTMLElement, label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  return button!;
}

describe("EditorFormattingToolbar", () => {
  beforeAll(() => {
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0);
    }
    if (!window.cancelAnimationFrame) {
      window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    }
  });

  it("prevents toolbar mousedown from stealing the editor selection", () => {
    const { editor, destroy } = createTestEditor();
    const { container, unmount } = renderToolbar(editor);
    const button = getButton(container, labels.alignCenter);
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });

    act(() => {
      button.dispatchEvent(mouseDown);
    });

    expect(mouseDown.defaultPrevented).toBe(true);

    unmount();
    destroy();
  });

  it("applies left, center, and right alignment from the toolbar", () => {
    const { editor, destroy } = createTestEditor();
    const { container, unmount } = renderToolbar(editor);

    act(() => {
      editor.commands.focus();
      editor.commands.setTextSelection({ from: 1, to: 1 });
    });

    const centerButton = getButton(container, labels.alignCenter);
    act(() => {
      centerButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      centerButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(editor.getHTML()).toContain('text-align: center');

    const rightButton = getButton(container, labels.alignRight);
    act(() => {
      rightButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      rightButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(editor.getHTML()).toContain('text-align: right');

    const leftButton = getButton(container, labels.alignLeft);
    act(() => {
      leftButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      leftButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(editor.getHTML()).toContain('text-align: left');

    unmount();
    destroy();
  });

  it("disables formatting controls when editing is not allowed", () => {
    const { editor, destroy } = createTestEditor();
    const { container, unmount } = renderToolbar(editor, false);

    expect(getButton(container, labels.alignCenter).disabled).toBe(true);
    expect(getButton(container, labels.bold).disabled).toBe(true);

    unmount();
    destroy();
  });
});
