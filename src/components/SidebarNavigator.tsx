"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, Plus, Download, BookOpen, Trash2, Globe, Lock, GripVertical, Loader2, X } from "lucide-react";
import Link from "next/link";
import { createChapter, updateSettings, reorderChapters, deleteChapter } from "@/actions/projects";
import { useRef, useState, type ChangeEvent } from "react";
import type { ChapterMeta } from "@/types/project";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function toRichTextHtml(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^#{1,6}\s+/.test(block)) {
        const match = block.match(/^(#{1,6})\s+(.*)$/);
        if (!match) return `<p>${escapeHtml(block)}</p>`;
        const level = Math.min(match[1].length, 6);
        return `<h${level}>${escapeHtml(match[2].trim())}</h${level}>`;
      }

      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

      if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }

      if (lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line))) {
        return `<ol>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      }

      return `<p>${lines.map((line) => escapeHtml(line)).join("<br>")}</p>`;
    })
    .join("");
}

function getImportedChapterTitle(fileName: string, text: string, fallbackIndex: number) {
  const heading = text.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading;

  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  if (withoutExtension) return withoutExtension;

  return `Imported Chapter ${fallbackIndex}`;
}

function SortableChapter({
  chapter,
  openCommentCount,
  isSelected,
  isStoryBibleOpen,
  onSelect,
  canEdit,
}: {
  chapter: ChapterMeta;
  openCommentCount: number;
  isSelected: boolean;
  isStoryBibleOpen: boolean;
  onSelect: () => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group/item">
      {canEdit && (
        <button
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover/item:opacity-100 cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-500 transition-all touch-none"
          aria-label="Drag to reorder chapter"
        >
          <GripVertical size={14} />
        </button>
      )}
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3",
          isSelected && !isStoryBibleOpen
            ? "bg-white text-indigo-600 shadow-sm border border-slate-100 font-bold"
            : "text-slate-500 hover:bg-slate-100"
        )}
      >
        <div className={cn(
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          isSelected && !isStoryBibleOpen ? "bg-indigo-600" : "bg-slate-300 opacity-0 group-hover/item:opacity-100"
        )} />
        <span className="truncate">{chapter.title}</span>
        {openCommentCount > 0 && (
          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            {openCommentCount}
          </span>
        )}
      </button>
    </div>
  );
}

export function SidebarNavigator() {
  const project = useProjectStore((state) => state.project);
  const activeBranchId = useProjectStore((state) => state.activeBranchId);
  const setSelectedChapterId = useProjectStore((state) => state.setSelectedChapterId);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const isStoryBibleOpen = useProjectStore((state) => state.isStoryBibleOpen);
  const setIsStoryBibleOpen = useProjectStore((state) => state.setIsStoryBibleOpen);
  const setProject = useProjectStore((state) => state.setProject);
  const setChapterContent = useProjectStore((state) => state.setChapterContent);
  const requestTitleFocus = useProjectStore((state) => state.requestTitleFocus);
  const reorderChaptersLocally = useProjectStore((state) => state.reorderChaptersLocally);

  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeletingChapter, setIsDeletingChapter] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [createChapterError, setCreateChapterError] = useState<string | null>(null);
  const [createChapterWarning, setCreateChapterWarning] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [deleteChapterError, setDeleteChapterError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!project) return null;

  const canManage = project.viewerAccess?.canManage;
  const canEdit = project.viewerAccess?.canEdit;
  const selectedChapter = selectedChapterId
    ? project.chapters.find((chapter: ChapterMeta) => chapter.id === selectedChapterId) ?? null
    : null;
  const chapterCommentCounts = new Map(
    project.chapterCommentCounts.map((count) => [count.chapterId, count.openCount] as const)
  );

  const handleTogglePrivacy = async () => {
    if (!canManage || isUpdatingPrivacy) return;
    
    setIsUpdatingPrivacy(true);
    try {
      const newStatus = !project.metadata.isPublic;
      const updated = await updateSettings(project.metadata.id, { isPublic: newStatus });
      if (updated) {
        setProject(updated);
      }
    } catch (err) {
      console.error("Failed to update privacy:", err);
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const visibleChapters = project.chapters.filter((c: ChapterMeta) => c.branchId === activeBranchId);
  const activeBranch = project.branches.find((branch) => branch.id === activeBranchId);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = visibleChapters.findIndex((c) => c.id === active.id);
    const newIndex = visibleChapters.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(visibleChapters, oldIndex, newIndex);
    const orderedIds = reordered.map((c) => c.id);

    // Optimistic update
    reorderChaptersLocally(activeBranchId, orderedIds);

    try {
      await reorderChapters(project.metadata.id, orderedIds);
    } catch (err) {
      console.error("Failed to reorder chapters:", err);
      // Could revert here if needed
    }
  };

  const handleCreateChapter = async () => {
    if (!canEdit || !activeBranchId || isCreatingChapter) return;

    setIsCreatingChapter(true);
    setCreateChapterError(null);
    setCreateChapterWarning(null);
    setImportError(null);
    setImportWarning(null);
    setDeleteChapterError(null);

    try {
      const nextChapterNumber = visibleChapters.length + 1;
      const result = await createChapter(project.metadata.id, {
        title: `Untitled Chapter ${nextChapterNumber}`,
        summary: "",
        content: "",
        branchId: activeBranchId,
      });

      setProject(result.project);
      setChapterContent(result.chapter.id, result.chapter.content ?? "");
      setSelectedChapterId(result.chapter.id);
      setIsStoryBibleOpen(false);
      requestTitleFocus(result.chapter.id);
      setCreateChapterWarning(result.continuity.fresh || result.continuity.status === "queued" ? null : result.continuity.warning);
    } catch (error) {
      console.error("Failed to create chapter:", error);
      setCreateChapterError("Could not create a chapter. Try again.");
    } finally {
      setIsCreatingChapter(false);
    }
  };

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!canEdit || !activeBranchId || files.length === 0 || isImporting) return;

    setIsImporting(true);
    setImportError(null);
    setImportWarning(null);
    setCreateChapterError(null);
    setCreateChapterWarning(null);
    setDeleteChapterError(null);

    try {
      let latestProject = project;
      let lastImportedChapterId: string | null = null;
      let nextImportWarning: string | null = null;

      for (const [index, file] of files.entries()) {
        const rawText = await file.text();
        const normalizedText = rawText.replace(/^\uFEFF/, "").trim();
        const title = getImportedChapterTitle(file.name, normalizedText, visibleChapters.length + index + 1);
        const content = toRichTextHtml(normalizedText);

        const result = await createChapter(project.metadata.id, {
          title,
          summary: "",
          content,
          branchId: activeBranchId,
        });

        latestProject = result.project;
        lastImportedChapterId = result.chapter.id;
        setChapterContent(result.chapter.id, result.chapter.content ?? "");
        if (!result.continuity.fresh && result.continuity.status !== "queued") {
          nextImportWarning = "Imported chapter content saved, but continuity memory is stale for one or more imported chapters until a later save succeeds.";
        }
      }

      setProject(latestProject);
      setImportWarning(nextImportWarning);
      if (lastImportedChapterId) {
        setSelectedChapterId(lastImportedChapterId);
        setIsStoryBibleOpen(false);
      }
    } catch (error) {
      console.error("Failed to import chapters:", error);
      setImportError("Could not import one or more files. Use .txt or .md files and try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteSelectedChapter = async () => {
    if (!canEdit || !selectedChapter || isDeletingChapter) return;

    setIsDeletingChapter(true);
    setDeleteChapterError(null);
    setCreateChapterError(null);
    setImportError(null);

    const deletedIndex = visibleChapters.findIndex((chapter) => chapter.id === selectedChapter.id);

    try {
      const updatedProject = await deleteChapter(project.metadata.id, selectedChapter.id);
      if (!updatedProject) {
        throw new Error("Project not found after delete.");
      }
      const updatedVisibleChapters = updatedProject.chapters.filter((chapter: ChapterMeta) => chapter.branchId === activeBranchId);
      const nextChapterInBranch =
        updatedVisibleChapters[Math.min(deletedIndex, updatedVisibleChapters.length - 1)] ??
        updatedVisibleChapters[deletedIndex - 1];
      const nextChapterId = nextChapterInBranch?.id ?? updatedProject.chapters[0]?.id ?? null;

      setProject(updatedProject);
      setSelectedChapterId(nextChapterId);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to delete chapter:", error);
      setDeleteChapterError("Could not delete this chapter. Try again.");
    } finally {
      setIsDeletingChapter(false);
    }
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-[var(--background)]">
      {/* Back to Dashboard & Project Title */}
      <div className="p-4 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors mb-4">
          <ChevronLeft size={12} />
          Dashboard
        </Link>
        <h1 className="text-lg font-bold text-slate-900 leading-tight truncate">{project.metadata.name}</h1>
      </div>

      {/* Action Buttons */}
      {canEdit && (
        <div className="p-4 space-y-3">
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            multiple
            className="hidden"
            onChange={(event) => void handleImportFiles(event)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleCreateChapter()}
              disabled={isCreatingChapter || !activeBranchId}
              className="flex cursor-pointer items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Create new chapter"
            >
              {isCreatingChapter ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {isCreatingChapter ? "Creating..." : "New"}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting || !activeBranchId}
              title="Import Markdown or text files as chapters"
              className="flex cursor-pointer items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Import chapters"
            >
              {isImporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {isImporting ? "Importing..." : "Import"}
            </button>
          </div>
          {createChapterError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
              {createChapterError}
            </div>
          )}
          {createChapterWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              {createChapterWarning}
            </div>
          )}
          {importError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
              {importError}
            </div>
          )}
          {importWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              {importWarning}
            </div>
          )}
        </div>
      )}

      {/* Chapters List with DnD */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {visibleChapters.length === 0 ? (
          <div className="mx-2 mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
            <p className="text-sm font-bold text-slate-600">No chapters yet</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {canEdit
                ? `Create your first chapter in ${activeBranch?.name ?? "this branch"} with New.`
                : "This branch does not have any chapters yet."}
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleChapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {visibleChapters.map((chapter: ChapterMeta) => (
                <SortableChapter
                  key={chapter.id}
                  chapter={chapter}
                  openCommentCount={chapterCommentCounts.get(chapter.id) ?? 0}
                  isSelected={selectedChapterId === chapter.id}
                  isStoryBibleOpen={isStoryBibleOpen}
                  canEdit={!!canEdit}
                  onSelect={() => {
                    setSelectedChapterId(chapter.id);
                    setIsStoryBibleOpen(false);
                    setCreateChapterError(null);
                    setCreateChapterWarning(null);
                    setImportWarning(null);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="p-4 border-t border-slate-100 space-y-4">
        {/* Privacy Toggle */}
        <div className="bg-slate-50/50 rounded-2xl p-3 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visibility</span>
            {project.metadata.isPublic ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase">
                <Globe size={10} />
                Public
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
                <Lock size={10} />
                Private
              </span>
            )}
          </div>
          <button
            disabled={!canManage || isUpdatingPrivacy}
            onClick={handleTogglePrivacy}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold transition-all border shadow-sm",
              project.metadata.isPublic
                ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                : "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700"
            )}
          >
            {isUpdatingPrivacy ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : project.metadata.isPublic ? (
              <>Make Private</>
            ) : (
              <>Make Public</>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              isStoryBibleOpen ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
            )}>
              <BookOpen size={16} />
            </div>
            <span className={cn("text-xs font-bold transition-colors", isStoryBibleOpen ? "text-slate-900" : "text-slate-500")}>
              Story Bible
            </span>
          </div>
          <button 
            onClick={() => setIsStoryBibleOpen(!isStoryBibleOpen)}
            className={cn(
              "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2",
              isStoryBibleOpen ? "bg-indigo-600" : "bg-slate-200"
            )}
            aria-label="Toggle Story Bible"
            aria-pressed={isStoryBibleOpen}
          >
            <span className={cn(
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
              isStoryBibleOpen ? "translate-x-4" : "translate-x-0"
            )} />
          </button>
        </div>
        
        {canEdit && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={!selectedChapter || isDeletingChapter}
              className="flex w-full items-center gap-3 text-slate-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Delete current chapter"
              title={selectedChapter ? `Delete ${selectedChapter.title}` : "Select a chapter to delete"}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                {isDeletingChapter ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Trash</span>
            </button>
            {deleteChapterError && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
                {deleteChapterError}
              </div>
            )}
          </div>
        )}
      </div>
      <DeleteChapterDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        chapterTitle={selectedChapter?.title ?? "this chapter"}
        busy={isDeletingChapter}
        onConfirm={() => void handleDeleteSelectedChapter()}
      />
    </aside>
  );
}

function DeleteChapterDialog({
  open,
  onOpenChange,
  chapterTitle,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterTitle: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                  <Trash2 size={18} />
                </div>
                <div>
                  <Dialog.Title className="text-xl font-bold text-slate-900">Delete Chapter</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-slate-500">
                    Delete &ldquo;{chapterTitle}&rdquo;? This cannot be undone.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close delete dialog"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Delete Chapter
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
