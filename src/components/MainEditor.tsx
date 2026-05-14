"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { AiGenerated } from "@/lib/tiptap/AiGenerated";
import CharacterCount from "@tiptap/extension-character-count";
import { useProjectStore } from "@/store/useProjectStore";
import { useEffect, useState, useRef } from "react";
import { 
  Wand2, 
  Sparkles, 
  MessageSquare, 
  Type, 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  List, 
  ListOrdered, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  ChevronDown,
  Maximize2,
  Zap,
  Globe,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rewriteAction, describeAction } from "@/actions/ai";
import { updateChapter } from "@/actions/projects";
import { exportProjectAction } from "@/actions/export";
import { Download, History } from "lucide-react";

export function MainEditor({ onToggleHistory }: { onToggleHistory?: () => void }) {
  const { 
    project, 
    selectedChapterId, 
    activeBranchId, 
    addAiCard, 
    setIsGenerating, 
    isGenerating,
    pendingInsertion,
    clearPendingInsertion,
    updateChapterLocally,
    chapterContentCache,
    setChapterContent
  } = useProjectStore();

  const currentChapter = project?.chapters?.find((c: { id: string }) => c.id === selectedChapterId);
  const canEdit = project?.viewerAccess?.canEdit;

  const [title, setTitle] = useState(currentChapter?.title || "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Sync title when chapter changes (Adjusting state when props change)
  const [prevChapterId, setPrevChapterId] = useState(currentChapter?.id);
  if (currentChapter?.id !== prevChapterId) {
    setPrevChapterId(currentChapter?.id);
    setTitle(currentChapter?.title || "");
  }

  // Refs for auto-save on unmount
  const latestDataRef = useRef({
    title: currentChapter?.title || "",
    content: chapterContentCache[selectedChapterId || ""] || "",
    hasUnsavedChanges: false,
    projectId: project?.metadata?.id || "",
    chapterId: selectedChapterId || ""
  });

  useEffect(() => {
    latestDataRef.current = {
      title: title,
      content: chapterContentCache[selectedChapterId || ""] || "",
      hasUnsavedChanges,
      projectId: project?.metadata?.id || "",
      chapterId: selectedChapterId || ""
    };
  }, [title, chapterContentCache, hasUnsavedChanges, project?.metadata?.id, selectedChapterId]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure(),
      Underline,
      AiGenerated,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: canEdit ? "Start writing your story here..." : "Empty chapter.",
      }),
      CharacterCount.configure({ mode: "nodeSize" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none min-h-[500px] text-lg leading-relaxed text-slate-800",
      },
    },
    onUpdate: ({ editor }) => {
      if (selectedChapterId && !isLoadingContent) {
        setHasUnsavedChanges(true);
        updateChapterLocally(selectedChapterId, { content: editor.getHTML() });
      }
    },
  });

  useEffect(() => {
    if (!editor || !selectedChapterId || !project) return;

    const cachedContent = chapterContentCache[selectedChapterId];
    if (cachedContent !== undefined) {
      if (editor.getHTML() !== cachedContent) {
        editor.commands.setContent(cachedContent);
      }
      queueMicrotask(() => {
        setIsLoadingContent(false);
        setHasUnsavedChanges(false);
      });
      editor.setEditable(!!canEdit);
    } else {
      queueMicrotask(() => setIsLoadingContent(true));
      editor.setEditable(false);
      editor.commands.setContent("<p class='text-slate-400 italic'>Loading...</p>");
      
      import("@/actions/projects").then(({ getChapterContent }) => {
        getChapterContent(project.metadata.id, selectedChapterId)
          .then((content) => {
            setChapterContent(selectedChapterId, content || "");
            editor.commands.setContent(content || "");
            editor.setEditable(!!canEdit);
            setIsLoadingContent(false);
            setHasUnsavedChanges(false);
          })
          .catch(console.error);
      });
    }
  }, [selectedChapterId, editor, project, chapterContentCache, setChapterContent, canEdit]);

  // Debounced Save Effect
  useEffect(() => {
    if (!selectedChapterId || !project || !hasUnsavedChanges || isLoadingContent) return;
    
    const timeout = setTimeout(async () => {
      const content = chapterContentCache[selectedChapterId];
      if (content === undefined) return;

      setIsSaving(true);
      try {
        await updateChapter(project.metadata.id, selectedChapterId, {
          title: title,
          content: content,
        });
        setHasUnsavedChanges(false);
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [project, selectedChapterId, hasUnsavedChanges, isLoadingContent, title, chapterContentCache]);

  // Page reload protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Save on unmount (switching views)
  useEffect(() => {
    return () => {
      const { projectId, chapterId, title, content, hasUnsavedChanges: isDirty } = latestDataRef.current;
      if (isDirty && projectId && chapterId) {
        // Fire and forget save on unmount
        updateChapter(projectId, chapterId, { title, content }).catch(err => {
          console.error("Unmount save failed:", err);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (editor && pendingInsertion) {
      editor.chain().focus().insertContent(pendingInsertion).setAiGenerated().run();
      clearPendingInsertion();
    }
  }, [editor, pendingInsertion, clearPendingInsertion]);

  const handleWrite = async () => {
    if (!editor) return;
    const { state } = editor;
    const { selection } = state;
    
    // Get text before cursor (last 2000 chars for context)
    const textBefore = state.doc.textBetween(Math.max(0, selection.from - 2000), selection.from, "\n");
    
    setIsGenerating(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project!.metadata.id,
          branchId: activeBranchId,
          messages: [{ role: "user", content: `Please continue the story from this point:\n\n${textBefore}\n\nContinue the narrative naturally, maintaining the tone and style. Provide about 2-3 paragraphs.` }],
        }),
      });
      const result = await res.text();
      addAiCard({ type: "Write", content: result });
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRewrite = async (instructions = "Make it more vivid and emotional.") => {
    if (!editor || !project) return;
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, " ");
    if (!selection) return;

    setIsGenerating(true);
    try {
      const { result } = await rewriteAction(project.metadata.id, activeBranchId, {
        selection,
        instructions,
      });
      addAiCard({ type: "Rewrite", content: result });
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDescribe = async (sense = "sight") => {
    if (!editor || !project) return;
    const { from, to } = editor.state.selection;
    const selection = editor.state.doc.textBetween(from, to, " ");
    if (!selection) return;

    setIsGenerating(true);
    try {
      const { result } = await describeAction(project.metadata.id, activeBranchId, {
        selection,
        sense,
      });
      addAiCard({ type: `Describe (${sense})`, content: result });
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (!modifier || !editor || !project) return;

      // Cmd+S → immediate save
      if (e.key === "s") {
        e.preventDefault();
        const content = chapterContentCache[selectedChapterId || ""];
        if (selectedChapterId && content !== undefined && hasUnsavedChanges) {
          setIsSaving(true);
          updateChapter(project.metadata.id, selectedChapterId, { title, content })
            .then(() => setHasUnsavedChanges(false))
            .catch(console.error)
            .finally(() => setIsSaving(false));
        }
        return;
      }

      if (!e.shiftKey) return;

      // Cmd+Shift+W → Write
      if (e.key === "W" || e.key === "w") { e.preventDefault(); handleWrite(); }
      // Cmd+Shift+R → Rewrite
      if (e.key === "R" || e.key === "r") { e.preventDefault(); handleRewrite(); }
      // Cmd+Shift+D → Describe
      if (e.key === "D" || e.key === "d") { e.preventDefault(); handleDescribe(); }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, project, selectedChapterId, title, hasUnsavedChanges, chapterContentCache]);

  const handleBrainstorm = async () => {
    if (!editor || !project) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project!.metadata.id,
          branchId: activeBranchId,
          messages: [{ role: "user", content: `Based on the current chapter and story context, give me 5 creative brainstorming ideas for what could happen next, or some interesting world/character details to explore.` }],
        }),
      });
      const result = await res.text();
      addAiCard({ type: "Brainstorm", content: result });
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!editor) return null;

  if (!canEdit) {
    return (
      <div className="flex flex-col h-full bg-[var(--background)]">
        {/* Simple Navigation Header for Read-Only */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 bg-[var(--background)]">
          <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <Globe size={12} />
            Reading Mode
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <h2 className="text-sm font-bold text-slate-500 truncate">{project?.metadata?.name}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-20 py-20 scroll-smooth bg-[var(--background)]">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-5xl font-extrabold text-slate-900 mb-12 tracking-tight leading-tight">
              {currentChapter?.title || "Untitled Chapter"}
            </h1>
            <div className="prose prose-slate max-w-none text-xl leading-relaxed text-slate-800">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasSelection = editor ? !editor.state.selection.empty : false;

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Top Toolbar (Main Actions) */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-slate-50 bg-[var(--background)]">
        <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
          <ToolbarTooltip text="Place your cursor at the end of some text and click Write. Sudowrite will continue it! (The more text in your doc, the better.)">
            <button 
              onClick={() => handleWrite()}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-1.5 bg-white text-slate-900 rounded-lg text-sm font-bold shadow-sm border border-slate-100 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <Wand2 size={16} className="text-indigo-600" />
              Write
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </ToolbarTooltip>
          
          <ToolbarTooltip text="Select a sentence, paragraph, or more then click Rewrite to rephrase, add description, mimic a famous style, or transform your text in other ways.">
            <button 
              onClick={() => handleRewrite()}
              disabled={isGenerating || !hasSelection}
              className="flex items-center gap-2 px-4 py-1.5 text-slate-600 rounded-lg text-sm font-bold hover:bg-white hover:text-slate-900 transition-all disabled:opacity-50"
            >
              <Sparkles size={16} className="text-indigo-600" />
              Rewrite
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </ToolbarTooltip>

          <ToolbarTooltip text="Select a word or phrase and click Describe for suggestions using all five senses and even metaphors!">
            <button 
              onClick={() => handleDescribe()}
              disabled={isGenerating || !hasSelection}
              className="flex items-center gap-2 px-4 py-1.5 text-slate-600 rounded-lg text-sm font-bold hover:bg-white hover:text-slate-900 transition-all disabled:opacity-50"
            >
              <MessageSquare size={16} className="text-indigo-600" />
              Describe
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </ToolbarTooltip>
          
          <ToolbarTooltip text="Use Brainstorm for help with ideas for character names, dialogue, world details, descriptions, plot points, or anything else!">
            <button 
              onClick={() => handleBrainstorm()}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-1.5 text-slate-600 rounded-lg text-sm font-bold hover:bg-white hover:text-slate-900 transition-all disabled:opacity-50"
            >
              <Zap size={16} className="text-indigo-600" />
              Brainstorm
            </button>
          </ToolbarTooltip>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            <div className={cn(
              "w-2 h-2 rounded-full transition-colors", 
              isSaving ? "bg-amber-400 animate-pulse" : hasUnsavedChanges ? "bg-slate-300" : "bg-green-500"
            )} />
            {isSaving ? "Saving..." : hasUnsavedChanges ? "Unsaved Changes" : "Saved"}
          </div>
          {onToggleHistory && (
            <button
              onClick={onToggleHistory}
              title="Version History"
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <History size={16} />
            </button>
          )}
          <button
            onClick={async () => {
              if (!project || isExporting) return;
              setIsExporting(true);
              try {
                const md = await exportProjectAction(project.metadata.id);
                const blob = new Blob([md], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${project.metadata.name.replace(/[^a-z0-9]/gi, "_")}.md`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error(err);
              } finally {
                setIsExporting(false);
              }
            }}
            title="Export project as Markdown"
            disabled={isExporting}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <Download size={16} />
          </button>
          <button title="Coming soon" disabled className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="flex items-center gap-4 px-6 py-1.5 border-b border-slate-100 bg-[var(--background)]">
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
            <UnderlineIcon size={16} />
          </ToolbarButton>
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
            <ListOrdered size={16} />
          </ToolbarButton>
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
            <AlignRight size={16} />
          </ToolbarButton>
        </div>
      </div>

      {/* Floating Selection Toolbar (Bubble Menu) */}
      <BubbleMenu 
        editor={editor} 
        className="flex items-center bg-slate-900 text-white rounded-xl shadow-2xl overflow-hidden divide-x divide-slate-800 border border-slate-800"
      >
        <button title="Coming soon" disabled className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50">
          <MessageSquare size={12} />
          Comment
        </button>
        <button 
          onClick={() => handleRewrite()}
          disabled={!hasSelection}
          className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Sparkles size={12} />
          Rewrite
        </button>
        <button 
          onClick={() => handleDescribe("sight")}
          disabled={!hasSelection}
          className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Search size={12} />
          Describe
        </button>
        <button title="Coming soon" disabled className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center gap-2 text-indigo-400 disabled:opacity-50">
          <Zap size={12} />
          Expand
        </button>
      </BubbleMenu>

      {/* Editor Surface */}
      <div className="flex-1 overflow-y-auto px-20 py-16 scroll-smooth">
        <div className="max-w-3xl mx-auto">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (selectedChapterId) {
                setHasUnsavedChanges(true);
                updateChapterLocally(selectedChapterId, { title: e.target.value });
              }
            }}
            placeholder="Chapter Title"
            aria-label="Chapter Title"
            className="w-full text-4xl font-extrabold text-slate-900 bg-transparent border-b border-slate-200 outline-none mb-10 pb-4 placeholder:text-slate-200 tracking-tight transition-colors focus:border-slate-400"
          />
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status Bar */}
      {editor && (
        <div className="flex items-center gap-4 px-20 py-2 border-t border-slate-100 bg-[var(--background)]">
          <span className="text-[11px] text-slate-400">
            {editor.storage.characterCount?.words?.() ?? 0} words
          </span>
          <span className="text-slate-200">·</span>
          <span className="text-[11px] text-slate-400">
            {editor.storage.characterCount?.characters?.() ?? 0} characters
          </span>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ children, onClick, active }: { children: React.ReactNode, onClick: () => void, active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-lg transition-all",
        active ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarTooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="group relative flex justify-center">
      {children}
      <div className="absolute top-full mt-3 flex-col items-center hidden group-hover:flex z-50 animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="w-3 h-3 bg-slate-900 rotate-45 -mb-1.5" />
        <div className="bg-slate-900 text-white text-[11px] font-medium p-3 rounded-xl shadow-2xl max-w-[200px] text-center leading-relaxed">
          {text}
        </div>
      </div>
    </div>
  );
}
