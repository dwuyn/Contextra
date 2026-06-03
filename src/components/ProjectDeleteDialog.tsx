"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { Trash2, Loader2 } from "lucide-react";

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  busy: boolean;
  onConfirm: () => void;
}

export function ProjectDeleteDialog({
  open,
  onOpenChange,
  projectName,
  busy,
  onConfirm,
}: ProjectDeleteDialogProps) {
  const t = useTranslations();
  const dt = useTranslations("dashboard");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-text)]/15 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[var(--color-surface)] p-8 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
                <Trash2 size={18} />
              </div>
              <div>
                <Dialog.Title className="text-xl font-bold text-[var(--color-text)]">
                  {dt("deleteProjectTitle", { name: projectName })}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {dt("deleteProjectDescription")}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button className="rounded-2xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition-colors">
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-destructive)] px-5 py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? dt("deleting") : dt("deleteProjectConfirm")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
