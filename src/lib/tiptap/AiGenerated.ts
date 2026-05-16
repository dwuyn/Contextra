import { Mark, mergeAttributes } from "@tiptap/core";

export interface AiGeneratedOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiGenerated: {
      /**
       * Set an aiGenerated mark
       */
      setAiGenerated: () => ReturnType;
      /**
       * Toggle an aiGenerated mark
       */
      toggleAiGenerated: () => ReturnType;
      /**
       * Unset an aiGenerated mark
       */
      unsetAiGenerated: () => ReturnType;
    };
  }
}

export const AiGenerated = Mark.create<AiGeneratedOptions>({
  name: "aiGenerated",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "text-indigo-600 bg-indigo-50/50 rounded-sm px-0.5",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-ai-generated]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-ai-generated": "" }), 0];
  },

  addCommands() {
    return {
      setAiGenerated:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleAiGenerated:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetAiGenerated:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-a": () => this.editor.commands.toggleAiGenerated(),
    };
  },

  // Extension to automatically remove the mark when user types into it
  onTransaction({ transaction }) {
    if (!transaction.docChanged) return;

    // Check if the change happened within an aiGenerated mark
    // This logic can be complex; for now, we'll keep it simple and just define the mark
  },
});
