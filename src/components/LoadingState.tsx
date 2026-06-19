"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface LoadingStateProps {
  variant?: "inline" | "overlay" | "fullscreen";
  message?: string;
}

export function LoadingState({ variant = "inline", message }: LoadingStateProps) {
  const t = useTranslations("common");

  return (
    <output
      className={cn(
        "flex items-center justify-center",
        variant === "inline" && "py-8",
        variant === "overlay" && "absolute inset-0 bg-[var(--color-canvas)]/80 backdrop-blur-sm z-10",
        variant === "fullscreen" && "min-h-screen"
      )}
      aria-busy="true"
      aria-label={message ?? t("loading")}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-[var(--color-text-muted)]" />
        {message && (
          <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
        )}
      </div>
    </output>
  );
}
