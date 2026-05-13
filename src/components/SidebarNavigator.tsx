"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { ChevronLeft, Plus, Download, BookOpen, Trash2, Globe, Lock, GripVertical } from "lucide-react";
import Link from "next/link";
import { updateSettings, reorderChapters } from "@/actions/projects";
import { useState } from "react";
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

function SortableChapter({
  chapter,
  isSelected,
  isStoryBibleOpen,
  onSelect,
  canEdit,
}: {
  chapter: ChapterMeta;
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
      </button>
    </div>
  );
}

export function SidebarNavigator() {
  const { 
    project, 
    activeBranchId, 
    setSelectedChapterId, 
    selectedChapterId, 
    isStoryBibleOpen, 
    setIsStoryBibleOpen,
    setProject,
    reorderChaptersLocally,
  } = useProjectStore();

  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!project) return null;

  const canManage = project.viewerAccess?.canManage;
  const canEdit = project.viewerAccess?.canEdit;

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = visibleChapters.findIndex((c) => c.id === active.id);
    const newIndex = visibleChapters.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(visibleChapters, oldIndex, newIndex);
    const orderedIds = reordered.map((c) => c.id);

    // Optimistic update
    reorderChaptersLocally(orderedIds);

    try {
      await reorderChapters(project.metadata.id, orderedIds);
    } catch (err) {
      console.error("Failed to reorder chapters:", err);
      // Could revert here if needed
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
        <div className="p-4 grid grid-cols-2 gap-2">
          <button className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm" aria-label="Create new chapter">
            <Plus size={14} />
            New
          </button>
          <button className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm" aria-label="Import chapter">
            <Download size={14} />
            Import
          </button>
        </div>
      )}

      {/* Chapters List with DnD */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleChapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {visibleChapters.map((chapter: ChapterMeta) => (
              <SortableChapter
                key={chapter.id}
                chapter={chapter}
                isSelected={selectedChapterId === chapter.id}
                isStoryBibleOpen={isStoryBibleOpen}
                canEdit={!!canEdit}
                onSelect={() => {
                  setSelectedChapterId(chapter.id);
                  setIsStoryBibleOpen(false);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
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
          <button className="flex items-center gap-3 w-full text-slate-400 hover:text-red-500 transition-colors" aria-label="Trash project">
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
              <Trash2 size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Trash</span>
          </button>
        )}
      </div>
    </aside>
  );
}
