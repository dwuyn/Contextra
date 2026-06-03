import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type EditorFormattingToolbarLabels = {
  bold: string;
  italic: string;
  underline: string;
  bulletList: string;
  orderedList: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
};

export function EditorFormattingToolbar({
  editor,
  canEdit,
  labels,
}: {
  editor: Editor;
  canEdit: boolean;
  labels: EditorFormattingToolbarLabels;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-1">
        <FormattingToolbarButton
          ariaLabel={labels.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          disabled={!canEdit}
        >
          <Bold size={16} />
        </FormattingToolbarButton>
        <FormattingToolbarButton
          ariaLabel={labels.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          disabled={!canEdit}
        >
          <Italic size={16} />
        </FormattingToolbarButton>
        <FormattingToolbarButton
          ariaLabel={labels.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          disabled={!canEdit}
        >
          <UnderlineIcon size={16} />
        </FormattingToolbarButton>
      </div>
      <div className="w-px h-4 bg-[var(--color-border)]" />
      <div className="flex items-center gap-1">
        <FormattingToolbarButton
          ariaLabel={labels.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          disabled={!canEdit}
        >
          <List size={16} />
        </FormattingToolbarButton>
        <FormattingToolbarButton
          ariaLabel={labels.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          disabled={!canEdit}
        >
          <ListOrdered size={16} />
        </FormattingToolbarButton>
      </div>
      <div className="w-px h-4 bg-[var(--color-border)]" />
      <div className="flex items-center gap-1">
        <FormattingToolbarButton
          ariaLabel={labels.alignLeft}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          disabled={!canEdit}
        >
          <AlignLeft size={16} />
        </FormattingToolbarButton>
        <FormattingToolbarButton
          ariaLabel={labels.alignCenter}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          disabled={!canEdit}
        >
          <AlignCenter size={16} />
        </FormattingToolbarButton>
        <FormattingToolbarButton
          ariaLabel={labels.alignRight}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          disabled={!canEdit}
        >
          <AlignRight size={16} />
        </FormattingToolbarButton>
      </div>
    </div>
  );
}

function FormattingToolbarButton({
  children,
  onClick,
  ariaLabel,
  active,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "cursor-pointer p-1.5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "bg-[var(--color-text)] text-white shadow-md"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text-secondary)]",
      )}
    >
      {children}
    </button>
  );
}
