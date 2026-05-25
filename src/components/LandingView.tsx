"use client";

import { Link } from "@/lib/i18n-client";
import type { ReactNode } from "react";
import {
  BookOpen,
  Bot,
  ChevronRight,
  FileText,
  NotebookPen,
  PanelLeft,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function LandingView() {
  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text)]">
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-text)] text-white">
              <BookOpen size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--color-text)]">Contextra</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Writing workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="rounded-full bg-[var(--color-text)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)]"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-[var(--color-border)] px-6 py-12 lg:py-16">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:gap-14">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">For fiction writers</p>
              <h1 className="mt-4 text-5xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-6xl">
                Contextra
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl">
                A calmer writing workspace for chapters, notes, and character details that belong in one place.
              </p>
              <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
                Return to a draft, see the parts of your story that matter, and keep moving without rebuilding everything from scratch.
              </p>

              <div className="mt-8">
                <Link 
                  href="/register" 
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-text)] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)]"
                >
                  Create account
                  <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <HeroPoint icon={<NotebookPen size={16} />} label="Draft scenes" />
                <HeroPoint icon={<ScrollText size={16} />} label="Keep notes close" />
                <HeroPoint icon={<Users size={16} />} label="Share projects" />
              </div>
            </div>

            <WorkspacePreview />
          </div>
        </section>

        <section className="px-6 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Why it feels easier</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-4xl">
                The main parts of your story stay close at hand.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
                Contextra keeps the writing space simple: your draft in front, your notes nearby, and room to work with other people when you need to.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <BenefitCard
                icon={<FileText size={20} />}
                title="Keep story details straight"
                description="Chapters, notes, and character reminders stay in the same workspace, so you spend less time hunting through tabs."
              />
              <BenefitCard
                icon={<Sparkles size={20} />}
                title="Pick up the thread faster"
                description="Open a project and get back to the scene with the important context already nearby."
              />
              <BenefitCard
                icon={<Users size={20} />}
                title="Collaborate when needed"
                description="Invite people into the same project when you want a second set of eyes, shared notes, or a co-writing pass."
              />
            </div>
          </div>
        </section>

        <div className="bg-[var(--color-canvas)] py-24">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center text-2xl font-bold text-[var(--color-text)]">
              See how it works
            </h2>
            <p className="mb-8 text-center text-[var(--color-text-secondary)]">
              Contextra remembers your characters, plot threads, and world-building as you write.
            </p>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
              <div className="prose prose-slate max-w-none text-[var(--color-text)]">
                <p>
                  The council chamber fell silent as <mark className="rounded bg-amber-100 px-1 text-amber-900">Elara</mark>{" "}
                  rose from her seat. Her hands, still bandaged from the encounter in the Ironwood Forest, gripped the edge
                  of the obsidian table...
                </p>
                <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text-secondary)]">
                  Contextra memory: Elara was wounded in Chapter 3 during the Ironwood Forest confrontation.
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="border-t border-[var(--color-border)] px-6 py-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Start with your next story</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Set up a workspace and start writing.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
                Begin with a blank project, build your notes as you go, and come back to a cleaner writing desk every time.
              </p>
            </div>

            <div>
              <p className="mb-3 text-center text-sm text-[var(--color-text-muted)]">Trusted by writers worldwide</p>
              <Link 
                href="/register" 
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-text)] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)]"
              >
                Create account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 text-sm text-[var(--color-text-secondary)] md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <BookOpen size={16} />
            <span className="font-bold text-[var(--color-text)]">Contextra</span>
          </div>
          <p>© 2026 Contextra. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function HeroPoint({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] shadow-sm">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-surface-alt)] text-[var(--color-text)]">
        {icon}
      </div>
      <span>{label}</span>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="animate-[page-enter_0.5s_ease-out_0.2s_both] overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Current project</p>
          <h2 className="truncate text-base font-bold text-[var(--color-text)]">The Hollow Orchard</h2>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <PreviewPill icon={<ScrollText size={14} />} label="Story notes" />
          <PreviewPill icon={<Bot size={14} />} label="Ask AI" />
        </div>
      </div>

      <div className="grid aspect-[16/10] min-h-[280px] grid-cols-[132px_minmax(0,1fr)] sm:min-h-[340px] sm:aspect-[4/3]">
        <aside className="border-r border-[var(--color-border)] bg-[var(--color-canvas)]/80 px-3 py-4">
          <div className="mb-4 flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            <PanelLeft size={14} />
            Library
          </div>

          <div className="space-y-1">
            <PreviewSidebarItem active label="Chapter 12" />
            <PreviewSidebarItem label="Chapter 13" />
            <PreviewSidebarItem label="Story bible" />
            <PreviewSidebarItem label="Characters" />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-[var(--color-accent-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent)]">
                Drafting
              </div>
              <div className="rounded-full bg-[var(--color-surface-alt)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                Character notes nearby
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              Mara stepped into the orchard and counted the trees she had marked before winter.
            </p>
          </div>

          <div className="flex-1 px-5 py-5">
            <div className="space-y-3">
              <PreviewLine width="w-full" />
              <PreviewLine width="w-[92%]" />
              <PreviewLine width="w-[96%]" />
              <PreviewLine width="w-[82%]" />
              <PreviewLine width="w-[88%]" />
              <PreviewLine width="w-[68%]" />
            </div>
          </div>

          <div className="grid gap-3 border-t border-[var(--color-border)] px-5 py-4 sm:grid-cols-3">
            <PreviewPanel
              icon={<NotebookPen size={16} />}
              title="Scene notes"
              detail="Where the scene is headed"
            />
            <PreviewPanel
              icon={<Users size={16} />}
              title="Characters"
              detail="Motives and recent changes"
            />
            <PreviewPanel
              icon={<Sparkles size={16} />}
              title="Writing help"
              detail="A nudge when you need it"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BenefitCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-surface-alt)] text-[var(--color-text)]">
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-bold text-[var(--color-text)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {description}
      </p>
    </div>
  );
}

function PreviewPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-text-secondary)]">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function PreviewSidebarItem({ active, label }: { active?: boolean; label: string }) {
  return (
    <div
      className={cn(
        "rounded-xl px-2 py-2 text-sm font-medium",
        active ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)]"
      )}
    >
      {label}
    </div>
  );
}

function PreviewLine({ width }: { width: string }) {
  return <div className={cn("h-2.5 rounded-full bg-[var(--color-surface-alt)]", width)} />;
}

function PreviewPanel({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[var(--color-canvas)] px-3 py-3">
      <div className="flex items-center gap-2 text-[var(--color-text)]">
        {icon}
        <span className="truncate text-sm font-bold">{title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{detail}</p>
    </div>
  );
}
