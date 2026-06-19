"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpen, ImagePlus, LoaderCircle, RefreshCcw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn, stripHtml } from "@/lib/utils";
import type { ChapterIllustrationMeta } from "@/types/project";

type ChapterIllustrationPageProps = {
  chapterTitle: string;
  projectName: string;
  chapterContent: string;
  illustration: ChapterIllustrationMeta | null;
  showGenerationPanel: boolean;
  canGenerate: boolean;
  isGenerating: boolean;
  error: string | null;
  onFlipBack: () => void;
  onGenerate: (customInstruction?: string) => Promise<void>;
};

export function ChapterIllustrationPage({
  chapterTitle,
  projectName,
  chapterContent,
  illustration,
  showGenerationPanel,
  canGenerate,
  isGenerating,
  error,
  onFlipBack,
  onGenerate,
}: ChapterIllustrationPageProps) {
  const t = useTranslations();
  const [customInstruction, setCustomInstruction] = useState("");
  const hasChapterContent = stripHtml(chapterContent).length > 0;

  return (
    <div className="flex h-full flex-col bg-[var(--color-canvas)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)]/50 bg-[var(--color-canvas)] px-6 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
            {t("editor.illustration.label")}
          </p>
          <h2 className="mt-2 truncate text-xl font-bold text-[var(--color-text)]">
            {chapterTitle || t("editor.untitledChapter")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onFlipBack}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-bold text-[var(--color-text)] shadow-sm transition-colors hover:bg-[var(--color-surface-alt)]"
        >
          <BookOpen size={16} className="text-[var(--color-accent)]" />
          {t("editor.illustration.backToEditor")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0))] px-6 py-6 md:px-8">
        <div
          className={cn(
            "mx-auto grid max-w-6xl gap-6",
            showGenerationPanel
              ? "xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.9fr)]"
              : "max-w-4xl",
          )}
        >
          <div className="rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:p-6">
            <div className="illustration-paper-frame relative aspect-[3/4] overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.42),rgba(255,255,255,0)_38%,rgba(15,23,42,0.14)_100%)]" />
              {illustration ? (
                <Image
                  src={illustration.url}
                  alt={t("editor.illustration.alt", { title: chapterTitle || t("editor.untitledChapter") })}
                  fill
                  sizes="(max-width: 1280px) 100vw, 60vw"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex min-h-[28rem] flex-col items-center justify-center px-8 py-12 text-center">
                  <div className="rounded-full border border-[var(--color-border)] bg-white/70 p-5 shadow-sm">
                    <Sparkles size={28} className="text-[var(--color-accent)]" />
                  </div>
                  <h3 className="mt-6 text-2xl font-bold text-[var(--color-text)]">
                    {t("editor.illustration.emptyTitle")}
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {t("editor.illustration.emptyDescription")}
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6">
                <div className="rounded-[20px] border border-white/25 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.82))] px-5 py-6 text-white shadow-xl backdrop-blur-[1px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
                    {projectName}
                  </p>
                  <h3 className="mt-2 text-3xl font-bold leading-tight">
                    {chapterTitle || t("editor.untitledChapter")}
                  </h3>
                </div>
              </div>
            </div>
          </div>

          {showGenerationPanel && (
            <div className="flex flex-col gap-4">
              <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
                  {t("editor.illustration.generateLabel")}
                </p>
                <h3 className="mt-3 text-2xl font-bold text-[var(--color-text)]">
                  {illustration ? t("editor.illustration.regenerateTitle") : t("editor.illustration.generateTitle")}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {t("editor.illustration.generateDescription")}
                </p>

                <label className="mt-5 block text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                  {t("editor.illustration.customInstruction")}
                </label>
                <textarea
                  value={customInstruction}
                  onChange={(event) => setCustomInstruction(event.target.value)}
                  disabled={!canGenerate || isGenerating}
                  placeholder={t("editor.illustration.customInstructionPlaceholder")}
                  className={cn(
                    "mt-3 min-h-32 w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-3 text-sm leading-relaxed text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]",
                    (!canGenerate || isGenerating) && "cursor-not-allowed opacity-70",
                  )}
                />

                <button
                  type="button"
                  onClick={() => void onGenerate(customInstruction.trim() || undefined)}
                  disabled={!canGenerate || !hasChapterContent || isGenerating}
                  className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--color-text)] px-4 py-3 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isGenerating ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : illustration ? (
                    <RefreshCcw size={18} />
                  ) : (
                    <ImagePlus size={18} />
                  )}
                  {isGenerating
                    ? t("editor.illustration.generating")
                    : illustration
                      ? t("editor.illustration.regenerate")
                      : t("editor.illustration.generate")}
                </button>

                {!hasChapterContent && (
                  <p className="mt-3 text-sm text-[var(--color-destructive)]">
                    {t("editor.illustration.missingChapterContent")}
                  </p>
                )}
                {error && (
                  <div className="mt-4 rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm font-medium text-[var(--color-destructive)]">
                    {error}
                  </div>
                )}
                {!canGenerate && (
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    {t("editor.illustration.readOnlyHint")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
