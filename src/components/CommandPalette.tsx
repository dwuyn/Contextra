"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/lib/i18n-client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { useZenStore } from "@/store/useZenStore";
import { toggleThemeDark } from "@/lib/appearance";
import {
  Search, FileText, Sun, Moon,
  Maximize2, Minimize2, Home,
} from "lucide-react";

interface CommandItem {
  id: string;
  group: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  chapters: { id: string; title: string }[];
}

export function CommandPalette({ chapters }: CommandPaletteProps) {
  const t = useTranslations("command");
  const router = useRouter();
  const { theme, setTheme } = usePreferencesStore();
  const { isZenMode, toggleZen } = useZenStore();
  const [palette, setPalette] = useState({ open: false, query: "", selectedIndex: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (palette.open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [palette.open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPalette({ open: !palette.open, query: "", selectedIndex: 0 });
      }
      if (e.key === "Escape" && palette.open) {
        setPalette((prev) => ({ ...prev, open: false }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [palette.open]);

  const allCommands: CommandItem[] = useMemo(() => [
    { id: "dashboard", group: t("navigation"), label: t("goToDashboard"), icon: <Home className="size-4" />,
      action: () => { router.push("/"); setPalette((prev) => ({ ...prev, open: false })); } },
    { id: "theme", group: t("settings"), label: t("toggleTheme"), icon: theme.endsWith("-dark") ? <Sun className="size-4" /> : <Moon className="size-4" />,
      action: () => { setTheme(toggleThemeDark(theme)); setPalette((prev) => ({ ...prev, open: false })); } },
    { id: "zen", group: t("settings"), label: t("toggleZen"), icon: isZenMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />,
      action: () => { toggleZen(); setPalette((prev) => ({ ...prev, open: false })); } },
    ...chapters.map((ch) => ({
      id: `chapter-${ch.id}`,
      group: t("chapters"),
      label: ch.title || "Untitled Chapter",
      icon: <FileText className="size-4" />,
      action: () => { setPalette((prev) => ({ ...prev, open: false })); },
    })),
  ], [t, router, theme, setTheme, isZenMode, toggleZen, chapters]);

  const filtered = useMemo(() => {
    if (!palette.query.trim()) return allCommands;
    const q = palette.query.toLowerCase();
    return allCommands.filter((cmd) => cmd.label.toLowerCase().includes(q));
  }, [allCommands, palette.query]);

  useEffect(() => {
    if (!palette.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPalette((prev) => ({ ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filtered.length - 1) }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setPalette((prev) => ({ ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) }));
      } else if (e.key === "Enter" && filtered[palette.selectedIndex]) {
        e.preventDefault();
        filtered[palette.selectedIndex].action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [palette.open, filtered, palette.selectedIndex]);

  if (!palette.open) return null;

  const groups = new Map<string, CommandItem[]>();
  filtered.forEach((cmd) => {
    const g = groups.get(cmd.group) || [];
    g.push(cmd);
    groups.set(cmd.group, g);
  });

  let itemIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <button type="button" aria-label="Close search" className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] block" onClick={() => setPalette((prev) => ({ ...prev, open: false }))} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Search className="size-5 text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={searchInputRef}
            aria-label={t("placeholder")}
            value={palette.query}
            onChange={(e) => {
              setPalette({ open: true, query: e.target.value, selectedIndex: 0 });
            }}
            placeholder={t("placeholder")}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none
              placeholder:text-[var(--color-text-muted)]"
          />
          <kbd className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-1.5 py-0.5
            text-xs text-[var(--color-text-muted)] font-mono">
            esc
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
              {t("noResults")}
            </p>
          ) : (
            Array.from(groups.entries()).map(([group, cmds]) => (
              <div key={group} className="mb-1">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {group}
                </p>
                {cmds.map((cmd) => {
                  const idx = itemIndex++;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onClick={cmd.action}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        idx === palette.selectedIndex
                          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                          : "text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
                      )}
                    >
                      <span className="shrink-0">{cmd.icon}</span>
                      <span className="flex-1 text-left">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="text-xs text-[var(--color-text-muted)]">{cmd.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
