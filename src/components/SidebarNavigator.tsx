"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, Plus, Download, BookOpen, Trash2, Globe, Lock, GripVertical, Loader2, X, GitBranch } from "lucide-react";
import { Link } from "@/lib/i18n-client";
import { useTranslations } from "next-intl";
import { createBranch, createChapter, renameProject, updateSettings, reorderChapters, deleteChapter } from "@/actions/projects";
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
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
    .flatMap((block) => {
      const trimmed = block.trim();
      return trimmed ? [trimmed] : [];
    })
    .map((block) => {
      if (/^#{1,6}\s+/.test(block)) {
        const match = block.match(/^(#{1,6})\s+(.*)$/);
        if (!match) return `<p>${escapeHtml(block)}</p>`;
        const level = Math.min(match[1].length, 6);
        return `<h${level}>${escapeHtml(match[2].trim())}</h${level}>`;
      }

      const lines = block.split("\n").flatMap((line) => {
        const trimmed = line.trim();
        return trimmed ? [trimmed] : [];
      });

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
  const st = useTranslations("sidebar");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group/item">
      {canEdit && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover/item:opacity-100 cursor-grab active:cursor-grabbing p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-all touch-none"
          aria-label={st("dragToReorder")}
        >
          <GripVertical size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex-1 text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3",
          isSelected && !isStoryBibleOpen
            ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm border border-[var(--color-border)] font-bold"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
        )}
      >
        <div className={cn(
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          isSelected && !isStoryBibleOpen ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)] opacity-0 group-hover/item:opacity-100"
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
  const st = useTranslations("sidebar");
  const project = useProjectStore((state) => state.project);
  const activeBranchId = useProjectStore((state) => state.activeBranchId);
  const setActiveBranchId = useProjectStore((state) => state.setActiveBranchId);
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
  const [isCreateBranchDialogOpen, setIsCreateBranchDialogOpen] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [createChapterError, setCreateChapterError] = useState<string | null>(null);
  const [createChapterWarning, setCreateChapterWarning] = useState<string | null>(null);
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [deleteChapterError, setDeleteChapterError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const renameProjectLocally = useProjectStore((state) => state.renameProjectLocally);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const canManage = project.viewerAccess?.canManage;
  const canEdit = project.viewerAccess?.canEdit;

  const handleStartRename = () => {
    if (!canEdit) return;
    setRenameValue(project.metadata.name);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const handleSubmitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === project.metadata.name) {
      setIsRenaming(false);
      return;
    }
    renameProjectLocally(trimmed);
    setIsRenaming(false);
    try {
      await renameProject(project.metadata.id, { name: trimmed });
    } catch {
      renameProjectLocally(project.metadata.name);
    }
  };

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmitRename();
    if (e.key === "Escape") setIsRenaming(false);
  };
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
  const activeBranches = project.branches.filter((branch) => branch.status === "active");
  const activeBranch = activeBranches.find((branch) => branch.id === activeBranchId);
  const baseChapterId = typeof activeBranch?.basedOnChapterId === "string" ? activeBranch.basedOnChapterId : "root";
  const baseChapter = baseChapterId !== "root"
    ? project.chapters.find((chapter: ChapterMeta) => chapter.id === baseChapterId)
    : null;
  const branchLineageLabel =
    baseChapterId === "root"
      ? st("independentBranch")
      : st("forkedFromChapter", { chapter: baseChapter?.title ?? st("unknownChapter") });

  const handleBranchChange = (branchId: string) => {
    const nextChapter = project.chapters.find((chapter: ChapterMeta) => chapter.branchId === branchId);
    setActiveBranchId(branchId);
    setSelectedChapterId(nextChapter?.id ?? null);
    setIsStoryBibleOpen(false);
    setCreateChapterError(null);
    setCreateChapterWarning(null);
    setCreateBranchError(null);
    setImportError(null);
    setImportWarning(null);
    setDeleteChapterError(null);
  };

  const handleCreateBranch = async (input: { name: string; description: string }) => {
    if (!canEdit || isCreatingBranch) return false;

    setIsCreatingBranch(true);
    setCreateBranchError(null);
    setCreateChapterError(null);
    setCreateChapterWarning(null);
    setImportError(null);
    setImportWarning(null);
    setDeleteChapterError(null);

    const beforeBranchIds = new Set(project.branches.map((branch) => branch.id));
    const basedOnChapterId = selectedChapter?.branchId === activeBranchId ? selectedChapter.id : "root";

    try {
      const updatedProject = await createBranch(project.metadata.id, {
        name: input.name,
        description: input.description || undefined,
        basedOnChapterId,
      });
      if (!updatedProject) {
        throw new Error("Project not found after branch create.");
      }
      const createdBranch = updatedProject.branches.find((branch) => !beforeBranchIds.has(branch.id));
      const nextBranchId = createdBranch?.id ?? activeBranchId;
      const nextChapter = updatedProject.chapters.find((chapter: ChapterMeta) => chapter.branchId === nextBranchId);

      setProject(updatedProject);
      setActiveBranchId(nextBranchId);
      setSelectedChapterId(nextChapter?.id ?? null);
      setIsStoryBibleOpen(false);
      setIsCreateBranchDialogOpen(false);
      return true;
    } catch (error) {
      console.error("Failed to create branch:", error);
      setCreateBranchError(st("createBranchError"));
      return false;
    } finally {
      setIsCreatingBranch(false);
    }
  };

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
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--background)]">
      {/* Back to Dashboard & Project Title */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <Link href="/" className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest hover:text-[var(--color-text)] transition-colors mb-4">
          <ChevronLeft size={12} />
          {st("dashboard")}
        </Link>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            aria-label={st("projectName")}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleSubmitRename}
            onKeyDown={handleRenameKeyDown}
            className="w-full text-lg font-bold text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1 outline-none focus:border-[var(--color-accent)]"
            maxLength={200}
          />
        ) : (
          <button
            type="button"
            onClick={handleStartRename}
            className="text-lg font-bold text-[var(--color-text)] leading-tight truncate bg-transparent border-0 p-0"
            title={st("clickToRename")}
            style={{ cursor: "pointer" }}
          >
            {project.metadata.name}
          </button>
        )}
      </div>

      {/* Branch Selector */}
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
          <GitBranch size={12} />
          {st("branchLabel")}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeBranchId}
            onChange={(event) => handleBranchChange(event.target.value)}
            className="min-w-0 flex-1 cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-bold text-[var(--color-text)] outline-none transition-all hover:bg-[var(--color-surface-alt)] focus:border-[var(--color-accent)]"
            aria-label={st("branchLabel")}
          >
            {activeBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsCreateBranchDialogOpen(true)}
              disabled={isCreatingBranch}
              className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm transition-all hover:bg-[var(--color-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={st("createBranch")}
              title={st("createBranch")}
            >
              {isCreatingBranch ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          )}
        </div>
        {activeBranch && (
          <p className="mt-2 truncate text-[11px] font-medium text-[var(--color-text-muted)]" title={branchLineageLabel}>
            {branchLineageLabel}
          </p>
        )}
        {createBranchError && (
          <div className="mt-3 rounded-xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-[11px] font-medium text-[var(--color-destructive)]">
            {createBranchError}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {canEdit && (
        <div className="p-4 space-y-3">
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            multiple
            aria-label={st("importChapters")}
            className="hidden"
            onChange={(event) => void handleImportFiles(event)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleCreateChapter()}
              disabled={isCreatingChapter || !activeBranchId}
              className="flex cursor-pointer items-center justify-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={st("addChapter")}
            >
              {isCreatingChapter ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {isCreatingChapter ? st("creating") : st("newChapter")}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting || !activeBranchId}
              title={st("importChapters")}
              className="flex cursor-pointer items-center justify-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={st("importChapters")}
            >
              {isImporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {isImporting ? st("importing") : st("importChapters")}
            </button>
          </div>
          {createChapterError && (
            <div className="rounded-xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-[11px] font-medium text-[var(--color-destructive)]">
              {createChapterError}
            </div>
          )}
          {createChapterWarning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              {createChapterWarning}
            </div>
          )}
          {importError && (
            <div className="rounded-xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-[11px] font-medium text-[var(--color-destructive)]">
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
          <div className="mx-2 mt-2 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-6 text-center">
            <p className="text-sm font-bold text-[var(--color-text-secondary)]">{st("noChapters")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              {canEdit
                ? st("createFirstChapter", { branch: activeBranch?.name ?? "this branch" })
                : st("noChaptersInBranch")}
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
      <div className="p-4 border-t border-[var(--color-border)] space-y-4">
        {/* Privacy Toggle */}
        <div className="bg-[var(--color-surface-alt)] rounded-2xl p-3 border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">{st("visibility")}</span>
            {project.metadata.isPublic ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-success)] uppercase">
                <Globe size={10} />
                {st("public")}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase">
                <Lock size={10} />
                {st("private")}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!canManage || isUpdatingPrivacy}
            onClick={handleTogglePrivacy}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-bold transition-all border shadow-sm",
              project.metadata.isPublic
                ? "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]"
                : "bg-[var(--color-accent)] text-white border-[var(--color-accent)] hover:bg-[var(--color-accent)]"
            )}
          >
            {isUpdatingPrivacy ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : project.metadata.isPublic ? (
              <>{st("makePrivate")}</>
            ) : (
              <>{st("makePublic")}</>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              isStoryBibleOpen ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]"
            )}>
              <BookOpen size={16} />
            </div>
            <span className={cn("text-xs font-bold transition-colors", isStoryBibleOpen ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)]")}>
              {st("storyBible")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsStoryBibleOpen(!isStoryBibleOpen)}
            className={cn(
              "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2",
              isStoryBibleOpen ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
            )}
            aria-label={st("toggleStoryBible")}
            aria-pressed={isStoryBibleOpen}
          >
            <span className={cn(
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[var(--color-surface)] shadow ring-0 transition duration-200 ease-in-out",
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
              className="flex w-full items-center gap-3 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-destructive)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={st("deleteChapter", { title: selectedChapter?.title ?? "" })}
              title={selectedChapter ? st("deleteChapter", { title: selectedChapter.title }) : st("selectChapterToDelete")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-alt)]">
                {isDeletingChapter ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">{st("trash")}</span>
            </button>
            {deleteChapterError && (
              <div className="rounded-xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-[11px] font-medium text-[var(--color-destructive)]">
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
      <CreateBranchDialog
        open={isCreateBranchDialogOpen}
        onOpenChange={setIsCreateBranchDialogOpen}
        busy={isCreatingBranch}
        onSubmit={handleCreateBranch}
      />
    </aside>
  );
}

function CreateBranchDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (input: { name: string; description: string }) => Promise<boolean>;
}) {
  const st = useTranslations("sidebar");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !busy) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName || busy) return;

    const didCreate = await onSubmit({
      name: trimmedName,
      description: description.trim(),
    });
    if (didCreate) resetForm();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/15 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                  <GitBranch size={18} />
                </div>
                <div>
                  <Dialog.Title className="text-xl font-bold text-[var(--color-text)]">{st("createBranchDialogTitle")}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {st("createBranchDialogDescription")}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={st("closeCreateBranchDialog")}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">{st("branchName")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                  maxLength={200}
                  required
                  className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder={st("branchNamePlaceholder")}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">{st("branchDescription")}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={busy}
                  rows={4}
                  className="mt-2 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder={st("branchDescriptionPlaceholder")}
                />
              </label>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {st("cancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent)] px-5 py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? st("creatingBranch") : st("createBranchAction")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  const st = useTranslations("sidebar");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/15 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
                  <Trash2 size={18} />
                </div>
                <div>
                  <Dialog.Title className="text-xl font-bold text-[var(--color-text)]">{st("deleteChapterDialogTitle")}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {st("deleteChapterDialogDescription", { title: chapterTitle })}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-xl p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
                  aria-label={st("closeDeleteDialog")}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-alt)]"
                >
                  {st("cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-destructive)] px-5 py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {st("deleteChapterDialogTitle")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
