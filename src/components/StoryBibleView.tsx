"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { 
  ChevronDown, 
  ChevronRight, 
  Sparkles, 
  Plus, 
  MoreHorizontal, 
  Type, 
  Palette, 
  FileText, 
  Users, 
  Globe, 
  ListOrdered 
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { updateSettings, updateContext } from "@/actions/projects";

export function StoryBibleView() {
  const { project } = useProjectStore();
  
  if (!project) return null;

  const handleUpdateSummary = async (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (project.metadata.summary === e.target.value) return;
    try { await updateSettings(project.metadata.id, { summary: e.target.value }); } catch (err) { console.error(err); }
  };

  const handleUpdateGenre = async (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (project.metadata.genre === e.target.value) return;
    try { await updateSettings(project.metadata.id, { genre: e.target.value }); } catch (err) { console.error(err); }
  };

  const handleUpdateNotes = async (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (project.contextMemory.sharedNotes === e.target.value) return;
    try { await updateContext(project.metadata.id, { sharedNotes: e.target.value }); } catch (err) { console.error(err); }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-12 py-10">
        <header className="mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Story Bible</h1>
          <p className="text-sm text-slate-400">Track the key details of your story's world to improve AI suggestions or fill it up step-by-step to grow your idea into a first draft.</p>
        </header>

        <div className="space-y-4">
          <BibleSection icon={<Type size={18} />} title="Braindump" defaultOpen>
            <textarea 
              placeholder="Write a braindump of everything you know about the story. You can include information about plot, characters, worldbuilding, theme - anything!"
              className="w-full min-h-[120px] bg-white border border-slate-100 rounded-xl p-4 text-sm text-slate-600 outline-none focus:border-slate-300 transition-colors resize-none"
              defaultValue={project.metadata.summary}
              onBlur={handleUpdateSummary}
            />
          </BibleSection>

          <BibleSection icon={<Palette size={18} />} title="Genre">
            <textarea 
              placeholder="What genre are you writing in? Feel free to include sub-genres and tropes."
              className="w-full min-h-[80px] bg-white border border-slate-100 rounded-xl p-4 text-sm text-slate-600 outline-none focus:border-slate-300 transition-colors resize-none"
              defaultValue={project.metadata.genre}
              onBlur={handleUpdateGenre}
            />
          </BibleSection>

          <BibleSection icon={<FileText size={18} />} title="Synopsis">
            <div className="relative group">
              <textarea 
                placeholder="Introduce the characters, their goals, and the central conflict, while conveying the story's tone, themes, and unique elements."
                className="w-full min-h-[100px] bg-white border border-slate-100 rounded-xl p-4 pr-32 text-sm text-slate-600 outline-none focus:border-slate-300 transition-colors resize-none"
                defaultValue={project.contextMemory.sharedNotes}
                onBlur={handleUpdateNotes}
              />
              <button title="Coming soon" disabled className="absolute right-4 top-4 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50">
                <Sparkles size={14} />
                Generate Synopsis
              </button>
            </div>
          </BibleSection>

          <BibleSection 
            icon={<Users size={18} />} 
            title="Characters" 
            actions={<button title="Coming soon" disabled className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"><Plus size={14} /> Add Character</button>}
          >
            <div className="space-y-3">
              {project.characters.map((char: any) => (
                <div key={char.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{char.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{char.role}</p>
                    <p className="text-xs text-slate-400 mt-2 italic leading-relaxed line-clamp-2">&ldquo;{char.memory}&rdquo;</p>
                  </div>
                  <button className="p-1.5 text-slate-300 hover:text-slate-500">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              ))}
            </div>
          </BibleSection>

          <BibleSection 
            icon={<Globe size={18} />} 
            title="Worldbuilding"
            actions={<button title="Coming soon" disabled className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"><Plus size={14} /> Add Element</button>}
          >
            <div className="space-y-2">
              {(project.contextMemory.worldRules ?? []).map((rule, i: number) => (
                <div key={i} className="px-4 py-3 bg-white border border-slate-100 rounded-xl text-xs text-slate-600 flex items-center justify-between group">
                  <span className="truncate">{rule as string}</span>
                  <button className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-slate-500 transition-all">
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              ))}
            </div>
          </BibleSection>

          <BibleSection 
            icon={<ListOrdered size={18} />} 
            title="Outline"
            actions={<div className="flex gap-4"><button title="Coming soon" disabled className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"><Plus size={14} /> Add Chapter</button><button title="Coming soon" disabled className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"><Plus size={14} /> Add Act</button></div>}
          >
            <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <button title="Coming soon" disabled className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-indigo-200 transition-all disabled:opacity-50">
                <Sparkles size={16} />
                Generate Novel Outline
              </button>
            </div>
          </BibleSection>
        </div>
      </div>
    </div>
  );
}

function BibleSection({ 
  icon, 
  title, 
  children, 
  defaultOpen = false,
  actions
}: { 
  icon: React.ReactNode, 
  title: string, 
  children: React.ReactNode, 
  defaultOpen?: boolean,
  actions?: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md bg-white">
      <div className="flex items-center justify-between px-6 py-4">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-4 group"
        >
          <div className="text-slate-400 group-hover:text-slate-600 transition-colors">
            {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-indigo-600">{icon}</div>
            <span className="font-bold text-slate-900">{title}</span>
          </div>
        </button>
        {actions && <div className="animate-in fade-in slide-in-from-right-2 duration-300">{actions}</div>}
      </div>
      {isOpen && (
        <div className="px-6 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}
