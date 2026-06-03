"use client";

import { useState } from "react";
import { createProject } from "@/actions/projects";
import { useRouter } from "@/lib/i18n-client";
import { X, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/useProjectStore";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("createProject");
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const requestTitleFocus = useProjectStore((state) => state.requestTitleFocus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError("");
    try {
      const project = await createProject({
        name: title.trim(),
        isPublic,
        mode: "personal",
        genre: "",
        summary: "",
      });
      if (project) {
        const starterChapterId = project.chapters[0]?.id;
        if (!starterChapterId) {
          throw new Error(t("missingStarterChapter"));
        }

        requestTitleFocus(starterChapterId);
        router.push(`/project/${project.metadata.id}`);
      } else {
        throw new Error(t("missingData"));
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("createFailed"));
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/20 backdrop-blur-sm animate-in fade-in duration-200" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-describedby="create-project-description"
        >
          <div className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-2xl font-bold text-[var(--color-text)]">{t("modalTitle")}</Dialog.Title>
              <Dialog.Close asChild>
                <button aria-label={t("closeDialog")} className="p-2 hover:bg-[var(--color-surface-alt)] rounded-full transition-colors">
                  <X size={20} className="text-[var(--color-text-muted)]" />
                </button>
              </Dialog.Close>
            </div>

            <Dialog.Description id="create-project-description" className="sr-only">
              {t("description")}
            </Dialog.Description>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="project-title" className="block text-sm font-semibold text-[var(--color-text)] mb-2">{t("titleLabel")}</label>
                <input
                  id="project-title"
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  className="w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 outline-none focus:border-[var(--color-text)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-text)] focus-visible:ring-offset-1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--color-text)] mb-4">{t("visibilityLabel")}</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left",
                      !isPublic 
                        ? "border-[var(--color-text)] bg-[var(--color-canvas)]" 
                        : "border-[var(--color-border)] hover:border-[var(--color-border)]"
                    )}
                  >
                    <Lock size={20} className={!isPublic ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"} />
                    <span className="block mt-2 font-bold text-[var(--color-text)]">{t("privateTitle")}</span>
                    <span className="text-[10px] text-[var(--color-text-secondary)] mt-1 leading-tight">{t("privateDescription")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left",
                      isPublic 
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]/30" 
                        : "border-[var(--color-border)] hover:border-[var(--color-border)]"
                    )}
                  >
                    <Globe size={20} className={isPublic ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"} />
                    <span className="block mt-2 font-bold text-[var(--color-text)]">{t("publicTitle")}</span>
                    <span className="text-[10px] text-[var(--color-text-secondary)] mt-1 leading-tight">{t("publicDescription")}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[var(--color-text)] py-4 font-bold text-white transition-transform active:scale-95 disabled:opacity-50 shadow-lg shadow-[var(--color-text)]/10"
              >
                {loading ? t("creating") : t("createAction")}
              </button>
              {error && <p className="rounded-xl bg-[var(--color-destructive)]/10 p-3 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
