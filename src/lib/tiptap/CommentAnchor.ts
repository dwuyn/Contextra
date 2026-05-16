import { Mark, mergeAttributes } from "@tiptap/core";

export interface CommentAnchorOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentAnchor: {
      setCommentAnchor: (attributes: { threadId: string }) => ReturnType;
      unsetCommentAnchor: () => ReturnType;
    };
  }
}

export const CommentAnchor = Mark.create<CommentAnchorOptions>({
  name: "commentAnchor",
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "rounded bg-amber-100/90 ring-1 ring-amber-200",
      },
    };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-thread-id"),
        renderHTML: (attributes) => {
          if (!attributes.threadId) return {};
          return {
            "data-comment-thread-id": attributes.threadId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-thread-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCommentAnchor:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetCommentAnchor:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
