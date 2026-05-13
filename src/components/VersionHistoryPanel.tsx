"use client";

import { useState } from "react";
import { Clock, RotateCcw, ChevronRight } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { getChapterVersions, restoreVersion } from "@/actions/projects";
import { cn } from "@/lib/utils";

interface Version {
  id: string;
  content: string;
  createdBy: string;
  createdAt: Date | string;
}

export function VersionHistoryPanel({ onClose }: { onClose: () => void }) {
  const { project, selectedChapterId, setChapterContent } = useProjectStore();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const chapterTitle = project?.chapters?.find((c: any) => c.id === selectedChapterId)?.title ?? "this chapter";

  const load = async () => {
    if (!project || !selectedChapterId || loading) return;
    setLoading(true);
    try {
      const v = await getChapterVersions(project.metadata.id, selectedChapterId);
      setVersions(v as unknown as Version[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount
  if (versions === null && !loading) {
    load();
  }

  const handleRestore = async (versionId: string) => {
    if (!project || !selectedChapterId) return;
    setIsRestoring(versionId);
    try {
      const content = await restoreVersion(project.metadata.id, selectedChapterId, versionId);
      setChapterContent(selectedChapterId, content ?? "");
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRestoring(null);
    }
  };

  const formatDate = (iso: Date | string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-100 w-72">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">Version History</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          aria-label="Close version history"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <p className="px-5 py-3 text-[11px] text-slate-400 border-b border-slate-50">
        Showing last 20 auto-saved versions for <span className="font-bold text-slate-600">{chapterTitle}</span>.
      </p>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && versions?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Clock size={32} className="text-slate-200 mb-4" />
            <p className="text-sm font-bold text-slate-400">No versions yet</p>
            <p className="text-xs text-slate-300 mt-1">Versions are saved automatically as you write.</p>
          </div>
        )}

        {versions?.map((v, i) => (
          <div
            key={v.id}
            className={cn(
              "border-b border-slate-50 transition-colors",
              preview === v.id ? "bg-indigo-50" : "hover:bg-slate-50"
            )}
          >
            <button
              onClick={() => setPreview(preview === v.id ? null : v.id)}
              className="w-full text-left px-5 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">{formatDate(v.createdAt)}</span>
                <span className="text-[10px] text-slate-400">{i === 0 ? "Latest" : `v${versions.length - i}`}</span>
              </div>
              {preview === v.id && (
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed line-clamp-3 italic">
                  &ldquo;{stripHtml(v.content)}&rdquo;
                </p>
              )}
            </button>
            {preview === v.id && (
              <div className="px-5 pb-3">
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={!!isRestoring}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isRestoring === v.id ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  Restore this version
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
