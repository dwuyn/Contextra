"use client";

import { useEffect, useMemo, useState } from "react";
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

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
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
  const replaceChapterContent = useProjectStore((state) => state.replaceChapterContent);
  const [versionsState, setVersionsState] = useState<{
    status: "loading" | "loaded";
    versions: Version[] | null;
    warning: string | null;
    error: string | null;
  }>({ status: "loading", versions: null, warning: null, error: null });
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !selectedChapterId) return;

    getChapterVersions(projectId, selectedChapterId)
      .then((v) => {
        if (!cancelled) {
          setVersionsState({ status: "loaded", versions: v as Version[], warning: null, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVersionsState({ status: "loaded", versions: null, warning: null, error: t("loadError") || "Failed to load version history." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedChapterId, t]);

  const handleRestore = async (versionId: string) => {
    if (!projectId || !selectedChapterId) return;
    if (confirmRestoreId !== versionId) {
      setConfirmRestoreId(versionId);
      return;
    }
    setIsRestoring(versionId);
    setVersionsState((prev) => ({ ...prev, warning: null }));
    try {
      const result = await restoreVersion(projectId, selectedChapterId, versionId);
      replaceChapterContent(selectedChapterId, result.content ?? "");
      if (result.continuity.fresh || result.continuity.status === "queued") {
        onClose();
      } else {
        const continuity = result.continuity as { warning?: string };
        setVersionsState((prev) => ({ ...prev, warning: continuity.warning ?? null, error: null }));
      }
    } catch (err) {
      console.error(err);
      setVersionsState((prev) => ({ ...prev, error: t("restoreError") || "Failed to restore version." }));
    } finally {
      setIsRestoring(null);
      setConfirmRestoreId(null);
    }
  };

  const dateFormatter = useMemo(() =>
    new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }), [locale]);
  const formatDate = (iso: Date | string) => {
    const d = new Date(iso);
    return dateFormatter.format(d);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] w-72">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)]">{t("title")}</h2>
        </div>
        <button
          type="button"
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
      {versionsState.warning && (
        <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
          {versionsState.warning}
        </div>
      )}
      {versionsState.error && (
        <div className="mx-5 mt-4 rounded-xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-3 py-2 text-[11px] font-medium text-[var(--color-destructive)]">
          {versionsState.error}
        </div>
      )}

      {/* Version List */}
      <div className="flex-1 overflow-y-auto">
        {versionsState.status === "loading" && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {versionsState.status === "loaded" && (!versionsState.versions || versionsState.versions.length === 0) && !versionsState.error && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Clock size={32} className="text-[var(--color-text-muted)] mb-4" />
            <p className="text-sm font-bold text-[var(--color-text-muted)]">{t("emptyTitle")}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{t("emptyDescription")}</p>
          </div>
        )}

        {versionsState.versions?.map((v, i) => (
          <div
            key={v.id}
            className={cn(
              "border-b border-[var(--color-border)] transition-colors",
              preview === v.id ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-canvas)]"
            )}
          >
            <button
              type="button"
              onClick={() => {
                setPreview(preview === v.id ? null : v.id);
                setConfirmRestoreId(null);
              }}
              className="w-full text-left px-5 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-text)]">{formatDate(v.createdAt)}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {i === 0 ? t("latest") : t("versionNumber", { number: versionsState.versions!.length - i })}
                </span>
              </div>
              {preview === v.id && (
                <p className="mt-2 text-[11px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-3 italic">
                  &ldquo;{stripHtml(v.content)}&rdquo;
                </p>
              )}
            </button>
            {preview === v.id && (
              <div className="px-5 pb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRestore(v.id)}
                  disabled={!!isRestoring}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50",
                    confirmRestoreId === v.id
                      ? "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                      : "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white"
                  )}
                >
                  {isRestoring === v.id ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {confirmRestoreId === v.id ? t("confirmRestore") || "Confirm Restore?" : t("restore")}
                </button>
                {confirmRestoreId === v.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreId(null)}
                    className="px-3 py-1.5 bg-transparent border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg text-xs font-bold hover:bg-[var(--color-surface-alt)] transition-colors"
                  >
                    {t("cancel")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
