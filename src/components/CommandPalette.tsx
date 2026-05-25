"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "@/lib/i18n-client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { useZenStore } from "@/store/useZenStore";
import { toggleThemeDark } from "@/lib/appearance";
import {
  Search, FileText, Settings, Sun, Moon,
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const allCommands: CommandItem[] = useMemo(() => [
    { id: "dashboard", group: t("navigation"), label: t("goToDashboard"), icon: <Home className="size-4" />,
      action: () => { router.push("/"); setOpen(false); } },
    { id: "theme", group: t("settings"), label: t("toggleTheme"), icon: theme.endsWith("-dark") ? <Sun className="size-4" /> : <Moon className="size-4" />,
      action: () => { setTheme(toggleThemeDark(theme)); setOpen(false); } },
    { id: "zen", group: t("settings"), label: t("toggleZen"), icon: isZenMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />,
      action: () => { toggleZen(); setOpen(false); } },
    ...chapters.map((ch) => ({
      id: `chapter-${ch.id}`,
      group: t("chapters"),
      label: ch.title || "Untitled Chapter",
      icon: <FileText className="size-4" />,
      action: () => { setOpen(false); },
    })),
  ], [t, router, theme, setTheme, isZenMode, toggleZen, chapters]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter((cmd) => cmd.label.toLowerCase().includes(q));
  }, [allCommands, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIndex]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  if (!open) return null;

  const groups = new Map<string, CommandItem[]>();
  filtered.forEach((cmd) => {
    const g = groups.get(cmd.group) || [];
    g.push(cmd);
    groups.set(cmd.group, g);
  });

  let itemIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Search className="size-5 text-[var(--color-text-muted)] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
                      onClick={cmd.action}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        idx === selectedIndex
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
