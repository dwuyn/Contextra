"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  ListOrdered,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import {
  deleteCharacter as deleteCharacterAction,
  updateContext,
  updateOutline as updateOutlineAction,
  updateSettings,
  upsertCharacter,
} from "@/actions/projects";

import { generateLongOutlineAction, generateOutlineAction, generateSynopsisAction } from "@/actions/ai";
import { cn } from "@/lib/utils";
import type {
  Character as ProjectCharacter,
  OutlineAct,
  OutlineChapter,
  ProjectData,
  ProjectOutline,
} from "@/types/project";

type BusyAction =
  | "summary"
  | "genre"
  | "synopsis"
  | "generateSynopsis"
  | "character"
  | "deleteCharacter"
  | "worldRule"
  | "outline"
  | "generateOutline"
  | "generateLongOutline"
  | null;

type CharacterDialogState =
  | { mode: "create" }
  | { mode: "edit"; character: ProjectCharacter }
  | null;

type WorldRuleDialogState =
  | { mode: "create" }
  | { mode: "edit"; index: number; value: string }
  | null;

type ActDialogState =
  | { mode: "create" }
  | { mode: "edit"; act: OutlineAct }
  | null;

type ChapterDialogState =
  | { mode: "create"; actId: string }
  | { mode: "edit"; actId: string; chapter: OutlineChapter }
  | null;



type ConfirmDialogState =
  | { kind: "replaceSynopsis" }
  | { kind: "replaceOutline" }
  | { kind: "replaceLongOutline" }
  | { kind: "deleteCharacter"; character: ProjectCharacter }
  | { kind: "deleteWorldRule"; index: number; label: string }
  | { kind: "deleteAct"; actId: string; title: string }
  | { kind: "deleteChapter"; actId: string; chapterId: string; title: string }
  | null;

type CharacterDraft = {
  name: string;
  role: string;
  memory: string;
};

type TextDraft = {
  title: string;
  summary: string;
};



const EMPTY_OUTLINE: ProjectOutline = { acts: [] };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function createClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getWorldRules(worldRules: unknown): string[] {
  return Array.isArray(worldRules) ? worldRules.filter((rule): rule is string => typeof rule === "string") : [];
}



function hasOutlineContent(outline: ProjectOutline) {
  return outline.acts.length > 0;
}

function createEmptyCharacterDraft(): CharacterDraft {
  return {
    name: "",
    role: "",
    memory: "",
  };
}

function createEmptyTextDraft(): TextDraft {
  return {
    title: "",
    summary: "",
  };
}



export function StoryBibleView() {
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);

  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [characterDialog, setCharacterDialog] = useState<CharacterDialogState>(null);
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft>(createEmptyCharacterDraft);

  const [worldRuleDialog, setWorldRuleDialog] = useState<WorldRuleDialogState>(null);
  const [worldRuleDraft, setWorldRuleDraft] = useState("");

  const [actDialog, setActDialog] = useState<ActDialogState>(null);
  const [actDraft, setActDraft] = useState<TextDraft>(createEmptyTextDraft);

  const [chapterDialog, setChapterDialog] = useState<ChapterDialogState>(null);
  const [chapterDraft, setChapterDraft] = useState<{ actId: string; title: string; summary: string }>({
    actId: "",
    title: "",
    summary: "",
  });

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const braindumpRef = useRef<HTMLTextAreaElement | null>(null);
  const genreRef = useRef<HTMLTextAreaElement | null>(null);
  const synopsisRef = useRef<HTMLTextAreaElement | null>(null);


  if (!project) return null;

  const currentProject = project;
  const outline = currentProject.outline ?? EMPTY_OUTLINE;
  const worldRules = getWorldRules(currentProject.contextMemory.worldRules);

  const canEdit = currentProject.viewerAccess.canEdit;
  const canManage = currentProject.viewerAccess.canManage;

  async function syncProjectUpdate(action: BusyAction, updater: () => Promise<ProjectData | null>) {
    setBusyAction(action);
    setErrorMessage(null);

    try {
      const nextProject = await updater();
      if (nextProject) {
        setProject(nextProject);
      }
      return nextProject;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateSummary() {
    if (!canManage) return;
    const nextSummary = braindumpRef.current?.value.trim() ?? currentProject.metadata.summary;
    if (nextSummary === currentProject.metadata.summary) return;

    await syncProjectUpdate("summary", () =>
      updateSettings(currentProject.metadata.id, {
        summary: nextSummary,
      })
    );
  }

  async function handleUpdateGenre() {
    if (!canManage) return;
    const nextGenre = genreRef.current?.value.trim() ?? currentProject.metadata.genre;
    if (nextGenre === currentProject.metadata.genre) return;

    await syncProjectUpdate("genre", () =>
      updateSettings(currentProject.metadata.id, {
        genre: nextGenre,
      })
    );
  }

  async function handleUpdateSynopsis() {
    if (!canEdit) return;
    const nextSynopsis = synopsisRef.current?.value.trim() ?? currentProject.contextMemory.sharedNotes;
    if (nextSynopsis === currentProject.contextMemory.sharedNotes) return;

    await syncProjectUpdate("synopsis", () =>
      updateContext(currentProject.metadata.id, {
        sharedNotes: nextSynopsis,
      })
    );
  }

  async function persistWorldRules(nextWorldRules: string[]) {
    return syncProjectUpdate("worldRule", () =>
      updateContext(currentProject.metadata.id, {
        worldRules: nextWorldRules,
      })
    );
  }

  async function persistOutline(nextOutline: ProjectOutline) {
    return syncProjectUpdate("outline", () => updateOutlineAction(currentProject.metadata.id, nextOutline));
  }

  function openCharacterCreate() {
    setCharacterDraft(createEmptyCharacterDraft());
    setCharacterDialog({ mode: "create" });
  }

  function openCharacterEdit(character: ProjectCharacter) {
    setCharacterDraft({
      name: character.name,
      role: character.role,
      memory: character.memory,
    });
    setCharacterDialog({ mode: "edit", character });
  }

  async function handleSaveCharacter() {
    if (!canEdit || !characterDialog) return;
    const name = characterDraft.name.trim();
    const role = characterDraft.role.trim();
    const memory = characterDraft.memory.trim();
    if (!name || !role || !memory) {
      setErrorMessage("Character name, role, and memory are required.");
      return;
    }

    const updated = await syncProjectUpdate("character", () =>
      upsertCharacter(
        currentProject.metadata.id,
        {
          name,
          role,
          memory,
        },
        characterDialog.mode === "edit" ? characterDialog.character.id : undefined
      )
    );

    if (updated) {
      setCharacterDialog(null);
      setCharacterDraft(createEmptyCharacterDraft());
    }
  }

  function openWorldRuleCreate() {
    setWorldRuleDraft("");
    setWorldRuleDialog({ mode: "create" });
  }

  function openWorldRuleEdit(index: number, value: string) {
    setWorldRuleDraft(value);
    setWorldRuleDialog({ mode: "edit", index, value });
  }

  async function handleSaveWorldRule() {
    if (!canEdit || !worldRuleDialog) return;
    const nextValue = worldRuleDraft.trim();
    if (!nextValue) {
      setErrorMessage("Worldbuilding entries cannot be empty.");
      return;
    }

    const nextWorldRules =
      worldRuleDialog.mode === "create"
        ? [...worldRules, nextValue]
        : worldRules.map((rule, index) => (index === worldRuleDialog.index ? nextValue : rule));

    const updated = await persistWorldRules(nextWorldRules);
    if (updated) {
      setWorldRuleDialog(null);
      setWorldRuleDraft("");
    }
  }

  function openActCreate() {
    setActDraft(createEmptyTextDraft());
    setActDialog({ mode: "create" });
  }

  function openActEdit(act: OutlineAct) {
    setActDraft({
      title: act.title,
      summary: act.summary,
    });
    setActDialog({ mode: "edit", act });
  }

  async function handleSaveAct() {
    if (!canEdit || !actDialog) return;
    const title = actDraft.title.trim();
    const summary = actDraft.summary.trim();
    if (!title) {
      setErrorMessage("Act title is required.");
      return;
    }

    const nextOutline =
      actDialog.mode === "create"
        ? {
            acts: [
              ...outline.acts,
              {
                id: createClientId("act"),
                title,
                summary,
                chapters: [],
              },
            ],
          }
        : {
            acts: outline.acts.map((act) =>
              act.id === actDialog.act.id
                ? {
                    ...act,
                    title,
                    summary,
                  }
                : act
            ),
          };

    const updated = await persistOutline(nextOutline);
    if (updated) {
      setActDialog(null);
      setActDraft(createEmptyTextDraft());
    }
  }

  function openChapterCreate(defaultActId?: string) {
    const fallbackActId = defaultActId || outline.acts[0]?.id || "";
    setChapterDraft({
      actId: fallbackActId,
      title: "",
      summary: "",
    });
    setChapterDialog({ mode: "create", actId: fallbackActId });
  }

  function openChapterEdit(actId: string, chapter: OutlineChapter) {
    setChapterDraft({
      actId,
      title: chapter.title,
      summary: chapter.summary,
    });
    setChapterDialog({ mode: "edit", actId, chapter });
  }

  async function handleSaveChapter() {
    if (!canEdit || !chapterDialog) return;
    const title = chapterDraft.title.trim();
    const summary = chapterDraft.summary.trim();
    if (!title) {
      setErrorMessage("Chapter title is required.");
      return;
    }
    if (!chapterDraft.actId) {
      setErrorMessage("Choose an act for this outline chapter.");
      return;
    }

    const chapterId =
      chapterDialog.mode === "edit" ? chapterDialog.chapter.id : createClientId("chapter");

    const nextChapter: OutlineChapter = {
      id: chapterId,
      title,
      summary,
    };

    const actsWithoutCurrentChapter = outline.acts.map((act) => ({
      ...act,
      chapters:
        chapterDialog.mode === "edit"
          ? act.chapters.filter((chapter) => chapter.id !== chapterDialog.chapter.id)
          : act.chapters,
    }));

    const nextOutline: ProjectOutline = {
      acts: actsWithoutCurrentChapter.map((act) =>
        act.id === chapterDraft.actId
          ? {
              ...act,
              chapters: [...act.chapters, nextChapter],
            }
          : act
      ),
    };

    const updated = await persistOutline(nextOutline);
    if (updated) {
      setChapterDialog(null);
      setChapterDraft({
        actId: "",
        title: "",
        summary: "",
      });
    }
  }

  async function handleGenerateSynopsis(forceReplace: boolean = false) {
    if (!canEdit) return;
    const currentSynopsis = synopsisRef.current?.value.trim() ?? currentProject.contextMemory.sharedNotes;
    const hasExistingSynopsis = currentSynopsis.length > 0;
    if (hasExistingSynopsis && !forceReplace) {
      setConfirmDialog({ kind: "replaceSynopsis" });
      return;
    }

    await syncProjectUpdate("generateSynopsis", () => generateSynopsisAction(currentProject.metadata.id));
  }

  async function handleGenerateOutline(forceReplace: boolean = false) {
    if (!canEdit) return;
    if (hasOutlineContent(outline) && !forceReplace) {
      setConfirmDialog({ kind: "replaceOutline" });
      return;
    }

    await syncProjectUpdate("generateOutline", () => generateOutlineAction(currentProject.metadata.id));
  }

  async function handleGenerateLongOutline(forceReplace: boolean = false) {
    if (!canEdit) return;
    if (hasOutlineContent(outline) && !forceReplace) {
      setConfirmDialog({ kind: "replaceLongOutline" });
      return;
    }

    await syncProjectUpdate("generateLongOutline", () =>
      generateLongOutlineAction(currentProject.metadata.id, { targetChapterCount: 200 })
    );
  }


  async function handleConfirmDialog() {
    if (!confirmDialog) return;

    switch (confirmDialog.kind) {
      case "replaceSynopsis":
        setConfirmDialog(null);
        await handleGenerateSynopsis(true);
        return;
      case "replaceOutline":
        setConfirmDialog(null);
        await handleGenerateOutline(true);
        return;
      case "replaceLongOutline":
        setConfirmDialog(null);
        await handleGenerateLongOutline(true);
        return;
      case "deleteCharacter": {
        const updated = await syncProjectUpdate("deleteCharacter", () =>
          deleteCharacterAction(currentProject.metadata.id, confirmDialog.character.id)
        );
        if (updated) setConfirmDialog(null);
        return;
      }
      case "deleteWorldRule": {
        const updated = await persistWorldRules(worldRules.filter((_, index) => index !== confirmDialog.index));
        if (updated) setConfirmDialog(null);
        return;
      }
      case "deleteAct": {
        const updated = await persistOutline({
          acts: outline.acts.filter((act) => act.id !== confirmDialog.actId),
        });
        if (updated) setConfirmDialog(null);
        return;
      }
      case "deleteChapter": {
        const updated = await persistOutline({
          acts: outline.acts.map((act) =>
            act.id === confirmDialog.actId
              ? {
                  ...act,
                  chapters: act.chapters.filter((chapter) => chapter.id !== confirmDialog.chapterId),
                }
              : act
          ),
        });
        if (updated) setConfirmDialog(null);
        return;
      }
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)] overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-12 py-10">
        <header className="mb-10">
          <h1 className="text-3xl font-extrabold text-[var(--color-text)] mb-2">Story Bible</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Track the key details of your story&apos;s world to improve AI suggestions or fill it up
            step-by-step to grow your idea into a first draft.
          </p>
          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--color-destructive)]">
              {errorMessage}
            </div>
          )}
        </header>

        <div className="space-y-4">
          <BibleSection icon={<Type size={18} />} title="Braindump" defaultOpen>
            <textarea
              key={`summary-${currentProject.metadata.updatedAt}`}
              ref={braindumpRef}
              placeholder="Write a braindump of everything you know about the story. You can include information about plot, characters, worldbuilding, theme - anything!"
              className="w-full min-h-[120px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-sm text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-text-secondary)] transition-colors resize-none"
              defaultValue={currentProject.metadata.summary}
              onBlur={() => void handleUpdateSummary()}
              disabled={!canManage || busyAction === "summary"}
            />
          </BibleSection>

          <BibleSection icon={<Palette size={18} />} title="Genre">
            <textarea
              key={`genre-${currentProject.metadata.updatedAt}`}
              ref={genreRef}
              placeholder="What genre are you writing in? Feel free to include sub-genres and tropes."
              className="w-full min-h-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-sm text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-text-secondary)] transition-colors resize-none"
              defaultValue={currentProject.metadata.genre}
              onBlur={() => void handleUpdateGenre()}
              disabled={!canManage || busyAction === "genre"}
            />
          </BibleSection>

          <BibleSection icon={<FileText size={18} />} title="Synopsis">
            <div className="relative group">
              <textarea
                key={`synopsis-${currentProject.metadata.updatedAt}`}
                ref={synopsisRef}
                placeholder="Introduce the characters, their goals, and the central conflict, while conveying the story's tone, themes, and unique elements."
                className="w-full min-h-[100px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 pr-40 text-sm text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-text-secondary)] transition-colors resize-none"
                defaultValue={currentProject.contextMemory.sharedNotes}
                onBlur={() => void handleUpdateSynopsis()}
                disabled={!canEdit || busyAction === "synopsis" || busyAction === "generateSynopsis"}
              />
              {canEdit && (
                <button
                  onClick={() => void handleGenerateSynopsis()}
                  disabled={busyAction === "generateSynopsis"}
                  className="absolute right-4 top-4 flex items-center gap-2 px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-xs font-bold shadow-md hover:bg-[var(--color-accent)] transition-all opacity-0 group-hover:opacity-100 disabled:opacity-60"
                >
                  {busyAction === "generateSynopsis" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Generate Synopsis
                </button>
              )}
            </div>
          </BibleSection>

          <BibleSection
            icon={<Users size={18} />}
            title="Characters"
            actions={
              canEdit ? (
                <SectionActionButton onClick={openCharacterCreate}>
                  <Plus size={14} /> Add Character
                </SectionActionButton>
              ) : undefined
            }
          >
            {currentProject.characters.length === 0 ? (
              <EmptyState
                title="No characters yet"
                description="Add protagonists, allies, or antagonists so the project keeps track of who matters."
                actionLabel={canEdit ? "Add Character" : undefined}
                onAction={canEdit ? openCharacterCreate : undefined}
              />
            ) : (
              <div className="space-y-3">
                {currentProject.characters.map((character) => (
                  <div
                    key={character.id}
                    className="p-4 bg-[var(--color-surface-alt)] rounded-xl border border-[var(--color-border)] flex items-start justify-between gap-4"
                  >
                    <div>
                      <h4 className="font-bold text-[var(--color-text)] text-sm">{character.name}</h4>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{character.role}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-2 italic leading-relaxed whitespace-pre-wrap">
                        &ldquo;{character.memory}&rdquo;
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2 shrink-0">
                        <IconActionButton
                          label={`Edit ${character.name}`}
                          onClick={() => openCharacterEdit(character)}
                        >
                          <Pencil size={14} />
                        </IconActionButton>
                        <IconActionButton
                          label={`Delete ${character.name}`}
                          variant="danger"
                          onClick={() => setConfirmDialog({ kind: "deleteCharacter", character })}
                        >
                          <Trash2 size={14} />
                        </IconActionButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </BibleSection>

          <BibleSection
            icon={<Globe size={18} />}
            title="Worldbuilding"
            actions={
              canEdit ? (
                <SectionActionButton onClick={openWorldRuleCreate}>
                  <Plus size={14} /> Add Element
                </SectionActionButton>
              ) : undefined
            }
          >
            {worldRules.length === 0 ? (
              <EmptyState
                title="No worldbuilding yet"
                description="Capture rules, places, magic systems, technologies, or social norms that the story should remember."
                actionLabel={canEdit ? "Add Element" : undefined}
                onAction={canEdit ? openWorldRuleCreate : undefined}
              />
            ) : (
              <div className="space-y-2">
                {worldRules.map((rule, index) => (
                  <div
                    key={`${rule}-${index}`}
                    className="px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text-secondary)] flex items-center justify-between gap-4"
                  >
                    <span className="leading-relaxed whitespace-pre-wrap">{rule}</span>
                    {canEdit && (
                      <div className="flex items-center gap-2 shrink-0">
                        <IconActionButton
                          label={`Edit world rule ${index + 1}`}
                          onClick={() => openWorldRuleEdit(index, rule)}
                        >
                          <Pencil size={14} />
                        </IconActionButton>
                        <IconActionButton
                          label={`Delete world rule ${index + 1}`}
                          variant="danger"
                          onClick={() => setConfirmDialog({ kind: "deleteWorldRule", index, label: rule })}
                        >
                          <Trash2 size={14} />
                        </IconActionButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </BibleSection>

          <BibleSection
            icon={<ListOrdered size={18} />}
            title="Outline"
            actions={
              canEdit ? (
                <div className="flex gap-4">
                  <SectionActionButton onClick={openActCreate}>
                    <Plus size={14} /> Add Act
                  </SectionActionButton>
                  <SectionActionButton
                    onClick={() => openChapterCreate()}
                    disabled={outline.acts.length === 0}
                  >
                    <Plus size={14} /> Add Chapter
                  </SectionActionButton>
                </div>
              ) : undefined
            }
          >
            {!hasOutlineContent(outline) ? (
              <div className="flex flex-col items-center justify-center py-10 bg-[var(--color-surface-alt)] rounded-2xl border border-dashed border-[var(--color-border)]">
                <button
                  onClick={() => void handleGenerateOutline()}
                  disabled={!canEdit || busyAction === "generateOutline"}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-indigo-200 transition-all disabled:opacity-50"
                >
                  {busyAction === "generateOutline" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Generate Novel Outline
                </button>
                <button
                  onClick={() => void handleGenerateLongOutline()}
                  disabled={!canEdit || busyAction === "generateLongOutline"}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 bg-[var(--color-text)] text-white rounded-xl text-sm font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {busyAction === "generateLongOutline" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Generate 200-Chapter Map
                </button>
                {canEdit && (
                  <button
                    onClick={openActCreate}
                    className="mt-4 text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                  >
                    or start by adding an act manually
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end">
                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleGenerateOutline()}
                        disabled={busyAction === "generateOutline"}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent-muted)] text-[var(--color-accent)] rounded-xl text-xs font-bold hover:bg-[var(--color-accent-muted)] transition-colors disabled:opacity-50"
                      >
                        {busyAction === "generateOutline" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Regenerate Outline
                      </button>
                      <button
                        onClick={() => void handleGenerateLongOutline()}
                        disabled={busyAction === "generateLongOutline"}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-text)] text-white rounded-xl text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-50"
                      >
                        {busyAction === "generateLongOutline" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        200-Chapter Map
                      </button>
                    </div>
                  )}
                </div>

                {outline.acts.map((act, index) => (
                  <div key={act.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                          Act {index + 1}
                        </p>
                        <h4 className="mt-1 text-lg font-bold text-[var(--color-text)]">{act.title}</h4>
                        {act.summary && (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
                            {act.summary}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => openChapterCreate(act.id)}
                            className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[11px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors"
                          >
                            <Plus size={12} />
                            Add Chapter
                          </button>
                          <IconActionButton label={`Edit ${act.title}`} onClick={() => openActEdit(act)}>
                            <Pencil size={14} />
                          </IconActionButton>
                          <IconActionButton
                            label={`Delete ${act.title}`}
                            variant="danger"
                            onClick={() => setConfirmDialog({ kind: "deleteAct", actId: act.id, title: act.title })}
                          >
                            <Trash2 size={14} />
                          </IconActionButton>
                        </div>
                      )}
                    </div>

                    {act.chapters.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                        No outline chapters yet for this act.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {act.chapters.map((chapter, chapterIndex) => (
                          <div
                            key={chapter.id}
                            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 flex items-start justify-between gap-4"
                          >
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                                Chapter {chapterIndex + 1}
                              </p>
                              <h5 className="mt-1 text-sm font-bold text-[var(--color-text)]">{chapter.title}</h5>
                              {chapter.summary && (
                                <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
                                  {chapter.summary}
                                </p>
                              )}
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-2 shrink-0">
                                <IconActionButton
                                  label={`Edit ${chapter.title}`}
                                  onClick={() => openChapterEdit(act.id, chapter)}
                                >
                                  <Pencil size={14} />
                                </IconActionButton>
                                <IconActionButton
                                  label={`Delete ${chapter.title}`}
                                  variant="danger"
                                  onClick={() =>
                                    setConfirmDialog({
                                      kind: "deleteChapter",
                                      actId: act.id,
                                      chapterId: chapter.id,
                                      title: chapter.title,
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </IconActionButton>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </BibleSection>
        </div>
      </div>

      <EntityDialog
        open={characterDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setCharacterDialog(null);
          }
        }}
        title={characterDialog?.mode === "edit" ? "Edit Character" : "Add Character"}
        description="Capture the character details this project should remember."
        onSubmit={() => void handleSaveCharacter()}
        submitLabel={characterDialog?.mode === "edit" ? "Save Character" : "Create Character"}
        busy={busyAction === "character"}
      >
        <FormInput
          label="Name"
          value={characterDraft.name}
          onChange={(value) => setCharacterDraft((draft) => ({ ...draft, name: value }))}
          placeholder="Character name"
        />
        <FormInput
          label="Role"
          value={characterDraft.role}
          onChange={(value) => setCharacterDraft((draft) => ({ ...draft, role: value }))}
          placeholder="Protagonist, mentor, rival..."
        />
        <FormTextarea
          label="Memory"
          value={characterDraft.memory}
          onChange={(value) => setCharacterDraft((draft) => ({ ...draft, memory: value }))}
          placeholder="What should the story always remember about this character?"
        />
      </EntityDialog>

      <EntityDialog
        open={worldRuleDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setWorldRuleDialog(null);
          }
        }}
        title={worldRuleDialog?.mode === "edit" ? "Edit Element" : "Add Element"}
        description="Save a world rule, setting detail, or other lore element."
        onSubmit={() => void handleSaveWorldRule()}
        submitLabel={worldRuleDialog?.mode === "edit" ? "Save Element" : "Create Element"}
        busy={busyAction === "worldRule"}
      >
        <FormTextarea
          label="Worldbuilding Element"
          value={worldRuleDraft}
          onChange={setWorldRuleDraft}
          placeholder="Describe a place, rule, system, taboo, or important lore fact."
        />
      </EntityDialog>

      <EntityDialog
        open={actDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setActDialog(null);
          }
        }}
        title={actDialog?.mode === "edit" ? "Edit Act" : "Add Act"}
        description="Define the big movement of the story."
        onSubmit={() => void handleSaveAct()}
        submitLabel={actDialog?.mode === "edit" ? "Save Act" : "Create Act"}
        busy={busyAction === "outline"}
      >
        <FormInput
          label="Act Title"
          value={actDraft.title}
          onChange={(value) => setActDraft((draft) => ({ ...draft, title: value }))}
          placeholder="Act I: Setup"
        />
        <FormTextarea
          label="Act Summary"
          value={actDraft.summary}
          onChange={(value) => setActDraft((draft) => ({ ...draft, summary: value }))}
          placeholder="What changes or escalates during this act?"
        />
      </EntityDialog>

      <EntityDialog
        open={chapterDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setChapterDialog(null);
          }
        }}
        title={chapterDialog?.mode === "edit" ? "Edit Outline Chapter" : "Add Outline Chapter"}
        description="Add a planning chapter inside a specific act. This does not create a real workspace chapter."
        onSubmit={() => void handleSaveChapter()}
        submitLabel={chapterDialog?.mode === "edit" ? "Save Chapter" : "Create Chapter"}
        busy={busyAction === "outline"}
      >
        <FormSelect
          label="Act"
          value={chapterDraft.actId}
          onChange={(value) => setChapterDraft((draft) => ({ ...draft, actId: value }))}
          options={outline.acts.map((act) => ({ value: act.id, label: act.title }))}
        />
        <FormInput
          label="Chapter Title"
          value={chapterDraft.title}
          onChange={(value) => setChapterDraft((draft) => ({ ...draft, title: value }))}
          placeholder="Chapter title"
        />
        <FormTextarea
          label="Chapter Summary"
          value={chapterDraft.summary}
          onChange={(value) => setChapterDraft((draft) => ({ ...draft, summary: value }))}
          placeholder="What should happen in this outline chapter?"
        />
      </EntityDialog>


      <ConfirmDialog
        open={confirmDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog(null);
          }
        }}
        title={getConfirmTitle(confirmDialog)}
        description={getConfirmDescription(confirmDialog)}
        confirmLabel={getConfirmLabel(confirmDialog)}
        confirmTone={getConfirmTone(confirmDialog)}
        busy={busyAction === "generateSynopsis" || busyAction === "generateOutline" || busyAction === "generateLongOutline" || busyAction === "deleteCharacter" || busyAction === "worldRule" || busyAction === "outline"}
        onConfirm={() => void handleConfirmDialog()}
      />
    </div>
  );
}

function getConfirmTitle(confirmDialog: ConfirmDialogState) {
  if (!confirmDialog) return "";

  switch (confirmDialog.kind) {
    case "replaceSynopsis":
      return "Replace existing synopsis?";
    case "replaceOutline":
      return "Replace existing outline?";
    case "replaceLongOutline":
      return "Replace existing outline with a 200-chapter map?";
    case "deleteCharacter":
      return `Delete ${confirmDialog.character.name}?`;
    case "deleteWorldRule":
      return "Delete worldbuilding element?";
    case "deleteAct":
      return `Delete ${confirmDialog.title}?`;
    case "deleteChapter":
      return `Delete ${confirmDialog.title}?`;
  }
}

function getConfirmDescription(confirmDialog: ConfirmDialogState) {
  if (!confirmDialog) return "";

  switch (confirmDialog.kind) {
    case "replaceSynopsis":
      return "Generating a new synopsis will overwrite the text currently in the Synopsis section.";
    case "replaceOutline":
      return "Generating a new outline will replace the acts and outline chapters you already have.";
    case "replaceLongOutline":
      return "Generating a long-form map will replace the current outline and create arc-level memory for future chapters.";
    case "deleteCharacter":
      return "This removes the character from the Story Bible. It does not rewrite existing chapters.";
    case "deleteWorldRule":
      return `Delete "${confirmDialog.label}" from Worldbuilding?`;
    case "deleteAct":
      return "Deleting an act also removes every outline chapter nested inside it.";
    case "deleteChapter":
      return "This removes the outline chapter from the current act.";
  }
}

function getConfirmLabel(confirmDialog: ConfirmDialogState) {
  if (!confirmDialog) return "Confirm";
  return confirmDialog.kind === "replaceSynopsis" || confirmDialog.kind === "replaceOutline" || confirmDialog.kind === "replaceLongOutline" ? "Replace" : "Delete";
}

function getConfirmTone(confirmDialog: ConfirmDialogState) {
  if (!confirmDialog) return "primary" as const;
  return confirmDialog.kind === "replaceSynopsis" || confirmDialog.kind === "replaceOutline" || confirmDialog.kind === "replaceLongOutline" ? ("primary" as const) : ("danger" as const);
}

function BibleSection({
  icon,
  title,
  children,
  defaultOpen = false,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-6 py-4 gap-4">
        <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-4 group">
          <div className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors">
            {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[var(--color-accent)]">{icon}</div>
            <span className="font-bold text-[var(--color-text)]">{title}</span>
          </div>
        </button>
        {actions && <div className="animate-in fade-in slide-in-from-right-2 duration-300 flex gap-4">{actions}</div>}
      </div>
      {isOpen && <div className="px-6 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">{children}</div>}
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 py-8 text-center">
      <p className="text-sm font-bold text-[var(--color-text)]">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)] max-w-lg mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors"
        >
          <Plus size={14} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SectionActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function IconActionButton({
  children,
  label,
  onClick,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-2 rounded-lg transition-colors border",
        variant === "danger"
          ? "border-[var(--color-destructive)]/20 text-[var(--color-text-muted)] hover:text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none"
      )}
    >
      {children}
    </button>
  );
}

function EntityDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/15 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <Dialog.Title className="text-2xl font-bold text-[var(--color-text)]">{title}</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-[var(--color-text-secondary)]">{description}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button aria-label="Close dialog" className="p-2 hover:bg-[var(--color-surface-alt)] rounded-full transition-colors">
                  <X size={20} className="text-[var(--color-text-muted)]" />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-5">{children}</div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={onSubmit}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-text)] px-5 py-3 text-sm font-bold text-white hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {submitLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmTone,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone: "primary" | "danger";
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/15 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "mt-1 flex h-10 w-10 items-center justify-center rounded-2xl",
                  confirmTone === "danger" ? "bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]" : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                )}
              >
                {confirmTone === "danger" ? <Trash2 size={18} /> : <Sparkles size={18} />}
              </div>
              <div>
                <Dialog.Title className="text-xl font-bold text-[var(--color-text)]">{title}</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {description}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={onConfirm}
                disabled={busy}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white transition-colors disabled:opacity-50",
                  confirmTone === "danger" ? "bg-[var(--color-destructive)] hover:opacity-90" : "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]"
                )}
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-text)] transition-colors"
      />
    </label>
  );
}

function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[120px] rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-text)] transition-colors resize-none"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-text)] transition-colors bg-[var(--color-surface)]"
      >
        <option value="" disabled>
          Select an act
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
