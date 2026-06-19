import type { AnyExtension } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { AiGenerated } from "@/lib/tiptap/AiGenerated";
import { CommentAnchor } from "@/lib/tiptap/CommentAnchor";

type CollaborationProviderLike = {
  awareness: unknown;
  document: unknown;
};

export const CHAPTER_COLLABORATION_FIELD = "default";

export function createChapterBaseExtensions(options?: { collaborative?: boolean }): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: options?.collaborative ? false : undefined,
    }),
    Underline,
    AiGenerated,
    CommentAnchor,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
  ];
}

export function createChapterEditorExtensions(options: {
  collaborative: boolean;
  placeholder: string;
  provider?: CollaborationProviderLike | null;
  user?: { name: string; color: string } | null;
  onCollaborationFirstRender?: () => void;
}): AnyExtension[] {
  const extensions = createChapterBaseExtensions({ collaborative: options.collaborative });

  if (options.collaborative && options.provider) {
    extensions.push(
      Collaboration.configure({
        document: options.provider.document as never,
        field: CHAPTER_COLLABORATION_FIELD,
        onFirstRender: options.onCollaborationFirstRender,
      }),
    );

    if (options.user) {
      extensions.push(
        CollaborationCaret.configure({
          provider: options.provider as never,
          user: options.user,
        }),
      );
    }
  }

  extensions.push(
    Placeholder.configure({
      placeholder: options.placeholder,
    }),
    CharacterCount.configure({ mode: "nodeSize" }),
  );

  return extensions;
}
