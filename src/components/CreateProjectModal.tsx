"use client";

import { useState } from "react";
import { createProject } from "@/actions/projects";
import { useRouter } from "next/navigation";
import { X, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const project = await createProject({
        name: title,
        isPublic,
        mode: "personal",
        genre: "Fiction",
        summary: "A new story.",
      });
      if (project) {
        router.push(`/project/${project.metadata.id}`);
      } else {
        throw new Error("Project creation returned no data.");
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-describedby="create-project-description"
        >
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-2xl font-bold text-slate-900">New Project</Dialog.Title>
              <Dialog.Close asChild>
                <button aria-label="Close dialog" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </Dialog.Close>
            </div>

            <Dialog.Description id="create-project-description" className="sr-only">
              Create a new writing project by entering a title and choosing its visibility.
            </Dialog.Description>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="project-title" className="block text-sm font-semibold text-slate-700 mb-2">Project Title</label>
                <input
                  id="project-title"
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's the name of your story?"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-900 transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-4">Project Visibility</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left",
                      !isPublic 
                        ? "border-slate-900 bg-slate-50" 
                        : "border-slate-100 hover:border-slate-200"
                    )}
                  >
                    <Lock size={20} className={!isPublic ? "text-slate-900" : "text-slate-400"} />
                    <span className="block mt-2 font-bold text-slate-900">Private</span>
                    <span className="text-[10px] text-slate-500 mt-1 leading-tight">Only you and collaborators can view this project.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left",
                      isPublic 
                        ? "border-indigo-600 bg-indigo-50/30" 
                        : "border-slate-100 hover:border-slate-200"
                    )}
                  >
                    <Globe size={20} className={isPublic ? "text-indigo-600" : "text-slate-400"} />
                    <span className="block mt-2 font-bold text-slate-900">Public</span>
                    <span className="text-[10px] text-slate-500 mt-1 leading-tight">Anyone with the link can read this project.</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-900 py-4 font-bold text-white transition-transform active:scale-95 disabled:opacity-50 shadow-lg shadow-slate-900/10"
              >
                {loading ? "Creating..." : "Create Project"}
              </button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
