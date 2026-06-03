"use client";

import { useEffect, useState } from "react";
import { Clock, RotateCcw, ChevronRight } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { getChapterVersions, restoreVersion } from "@/actions/projects";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

interface Version {
  id: string;
  content: string;
  createdBy: string;
  createdAt: Date | string;
}

export function VersionHistoryPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations("versionHistory");
  const locale = useLocale();
  const projectId = useProjectStore((state) => state.project?.metadata.id ?? null);
  const selectedChapterId = useProjectStore((state) => state.selectedChapterId);
  const selectedChapterTitle = useProjectStore((state) => {
    const chapterId = state.selectedChapterId;
    return state.project?.chapters.find((chapter) => chapter.id === chapterId)?.title ?? null;
  });
  const chapterTitle = selectedChapterTitle ?? t("chapterFallback");
  const setChapterContent = useProjectStore((state) => state.setChapterContent);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !selectedChapterId) return;

    getChapterVersions(projectId, selectedChapterId)
      .then((v) => {
        if (!cancelled) {
          setRestoreWarning(null);
          setVersions(v as Version[]);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedChapterId]);

  const handleRestore = async (versionId: string) => {
    if (!projectId || !selectedChapterId) return;
    setIsRestoring(versionId);
    setRestoreWarning(null);
    try {
      const result = await restoreVersion(projectId, selectedChapterId, versionId);
      setChapterContent(selectedChapterId, result.content ?? "");
      if (result.continuity.fresh || result.continuity.status === "queued") {
        onClose();
      } else {
        setRestoreWarning(result.continuity.warning);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRestoring(null);
    }
  };

  const formatDate = (iso: Date | string) => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] w-72">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)]">{t("title")}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-all"
          aria-label={t("close")}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <p className="px-5 py-3 text-[11px] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
        {t("intro", { chapterTitle })}
      </p>
      {restoreWarning && (
        <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
          {restoreWarning}
        </div>
      )}

      {/* Version List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && versions?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Clock size={32} className="text-[var(--color-text-muted)] mb-4" />
            <p className="text-sm font-bold text-[var(--color-text-muted)]">{t("emptyTitle")}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{t("emptyDescription")}</p>
          </div>
        )}

        {versions?.map((v, i) => (
          <div
            key={v.id}
            className={cn(
              "border-b border-[var(--color-border)] transition-colors",
              preview === v.id ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-canvas)]"
            )}
          >
            <button
              onClick={() => setPreview(preview === v.id ? null : v.id)}
              className="w-full text-left px-5 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-text)]">{formatDate(v.createdAt)}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {i === 0 ? t("latest") : t("versionNumber", { number: versions.length - i })}
                </span>
              </div>
              {preview === v.id && (
                <p className="mt-2 text-[11px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-3 italic">
                  &ldquo;{stripHtml(v.content)}&rdquo;
                </p>
              )}
            </button>
            {preview === v.id && (
              <div className="px-5 pb-3">
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={!!isRestoring}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-xs font-bold hover:bg-[var(--color-accent)] transition-colors disabled:opacity-50"
                >
                  {isRestoring === v.id ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {t("restore")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
