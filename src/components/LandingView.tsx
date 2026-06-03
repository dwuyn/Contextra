"use client";

import { Link } from "@/lib/i18n-client";
import type { ReactNode } from "react";
import { useLocale } from "next-intl";
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
  const isVietnamese = useLocale() === "vi";

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
              <p className="text-xs text-[var(--color-text-secondary)]">
                {isVietnamese ? "Không gian viết" : "Writing workspace"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              {isVietnamese ? "Đăng nhập" : "Sign In"}
            </Link>
            <Link 
              href="/register" 
              className="rounded-full bg-[var(--color-text)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)]"
            >
              {isVietnamese ? "Tạo tài khoản" : "Create account"}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-[var(--color-border)] px-6 py-12 lg:py-16">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:gap-14">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                {isVietnamese ? "Dành cho người viết tiểu thuyết" : "For fiction writers"}
              </p>
              <h1 className="mt-4 text-5xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-6xl">
                Contextra
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-[var(--color-text-secondary)] sm:text-xl">
                {isVietnamese
                  ? "Một không gian viết yên tĩnh hơn cho chương truyện, ghi chú và chi tiết nhân vật, tất cả nằm trong cùng một nơi."
                  : "A calmer writing workspace for chapters, notes, and character details that belong in one place."}
              </p>
              <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
                {isVietnamese
                  ? "Quay lại bản thảo, nhìn ngay những phần quan trọng của câu chuyện và tiếp tục viết mà không phải dựng lại mọi thứ từ đầu."
                  : "Return to a draft, see the parts of your story that matter, and keep moving without rebuilding everything from scratch."}
              </p>

              <div className="mt-8">
                <Link 
                  href="/register" 
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-text)] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)]"
                >
                  {isVietnamese ? "Tạo tài khoản" : "Create account"}
                  <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <HeroPoint icon={<NotebookPen size={16} />} label={isVietnamese ? "Soạn cảnh truyện" : "Draft scenes"} />
                <HeroPoint icon={<ScrollText size={16} />} label={isVietnamese ? "Giữ ghi chú bên cạnh" : "Keep notes close"} />
                <HeroPoint icon={<Users size={16} />} label={isVietnamese ? "Chia sẻ dự án" : "Share projects"} />
              </div>
            </div>

            <WorkspacePreview isVietnamese={isVietnamese} />
          </div>
        </section>

        <section className="px-6 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                {isVietnamese ? "Vì sao mọi thứ nhẹ nhàng hơn" : "Why it feels easier"}
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-4xl">
                {isVietnamese ? "Những phần quan trọng nhất của câu chuyện luôn ở ngay bên cạnh." : "The main parts of your story stay close at hand."}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
                {isVietnamese
                  ? "Contextra giữ cho không gian viết luôn gọn gàng: bản thảo ở phía trước, ghi chú ở gần và luôn có chỗ để làm việc cùng người khác khi bạn cần."
                  : "Contextra keeps the writing space simple: your draft in front, your notes nearby, and room to work with other people when you need to."}
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <BenefitCard
                icon={<FileText size={20} />}
                title={isVietnamese ? "Giữ chi tiết câu chuyện luôn nhất quán" : "Keep story details straight"}
                description={isVietnamese
                  ? "Chương truyện, ghi chú và nhắc nhớ về nhân vật nằm chung trong một không gian, giúp bạn bớt mất thời gian lục tìm giữa hàng loạt tab."
                  : "Chapters, notes, and character reminders stay in the same workspace, so you spend less time hunting through tabs."}
              />
              <BenefitCard
                icon={<Sparkles size={20} />}
                title={isVietnamese ? "Bắt lại mạch truyện nhanh hơn" : "Pick up the thread faster"}
                description={isVietnamese
                  ? "Mở dự án là có thể quay lại cảnh truyện ngay, với toàn bộ ngữ cảnh quan trọng đã nằm sẵn ở gần."
                  : "Open a project and get back to the scene with the important context already nearby."}
              />
              <BenefitCard
                icon={<Users size={20} />}
                title={isVietnamese ? "Cộng tác khi cần" : "Collaborate when needed"}
                description={isVietnamese
                  ? "Mời người khác vào cùng một dự án khi bạn cần thêm góc nhìn, ghi chú chung hoặc một vòng đồng sáng tác."
                  : "Invite people into the same project when you want a second set of eyes, shared notes, or a co-writing pass."}
              />
            </div>
          </div>
        </section>

        <div className="bg-[var(--color-canvas)] py-24">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-4 text-center text-2xl font-bold text-[var(--color-text)]">
              {isVietnamese ? "Xem cách nó hoạt động" : "See how it works"}
            </h2>
            <p className="mb-8 text-center text-[var(--color-text-secondary)]">
              {isVietnamese
                ? "Contextra ghi nhớ nhân vật, tuyến truyện và phần xây dựng thế giới của bạn ngay trong lúc viết."
                : "Contextra remembers your characters, plot threads, and world-building as you write."}
            </p>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
              <div className="prose prose-slate max-w-none text-[var(--color-text)]">
                <p>
                  {isVietnamese ? (
                    <>
                      Cả phòng họp lặng đi khi <mark className="rounded bg-amber-100 px-1 text-amber-900">Elara</mark>{" "}
                      đứng dậy khỏi ghế. Đôi tay cô, vẫn còn băng bó sau cuộc chạm trán ở Rừng Ironwood, siết chặt mép
                      bàn đá đen...
                    </>
                  ) : (
                    <>
                      The council chamber fell silent as <mark className="rounded bg-amber-100 px-1 text-amber-900">Elara</mark>{" "}
                      rose from her seat. Her hands, still bandaged from the encounter in the Ironwood Forest, gripped the edge
                      of the obsidian table...
                    </>
                  )}
                </p>
                <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text-secondary)]">
                  {isVietnamese
                    ? "Bộ nhớ Contextra: Elara bị thương ở Chương 3 trong cuộc đối đầu tại Rừng Ironwood."
                    : "Contextra memory: Elara was wounded in Chapter 3 during the Ironwood Forest confrontation."}
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="border-t border-[var(--color-border)] px-6 py-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                {isVietnamese ? "Bắt đầu với câu chuyện tiếp theo của bạn" : "Start with your next story"}
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-4xl">
                {isVietnamese ? "Thiết lập không gian và bắt đầu viết." : "Set up a workspace and start writing."}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
                {isVietnamese
                  ? "Bắt đầu với một dự án trống, xây ghi chú trong lúc viết và quay lại với một bàn viết gọn gàng hơn mỗi lần."
                  : "Begin with a blank project, build your notes as you go, and come back to a cleaner writing desk every time."}
              </p>
            </div>

            <div>
              <p className="mb-3 text-center text-sm text-[var(--color-text-muted)]">
                {isVietnamese ? "Được người viết tin dùng trên toàn thế giới" : "Trusted by writers worldwide"}
              </p>
              <Link 
                href="/register" 
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-text)] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-text)]"
              >
                {isVietnamese ? "Tạo tài khoản" : "Create account"}
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
          <p>{isVietnamese ? "© 2026 Contextra. Bảo lưu mọi quyền." : "© 2026 Contextra. All rights reserved."}</p>
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

function WorkspacePreview({ isVietnamese }: { isVietnamese: boolean }) {
  return (
    <div className="animate-[page-enter_0.5s_ease-out_0.2s_both] overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            {isVietnamese ? "Dự án hiện tại" : "Current project"}
          </p>
          <h2 className="truncate text-base font-bold text-[var(--color-text)]">
            {isVietnamese ? "Khu Vườn Rỗng" : "The Hollow Orchard"}
          </h2>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <PreviewPill icon={<ScrollText size={14} />} label={isVietnamese ? "Ghi chú truyện" : "Story notes"} />
          <PreviewPill icon={<Bot size={14} />} label={isVietnamese ? "Hỏi AI" : "Ask AI"} />
        </div>
      </div>

      <div className="grid aspect-[16/10] min-h-[280px] grid-cols-[132px_minmax(0,1fr)] sm:min-h-[340px] sm:aspect-[4/3]">
        <aside className="border-r border-[var(--color-border)] bg-[var(--color-canvas)]/80 px-3 py-4">
          <div className="mb-4 flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            <PanelLeft size={14} />
            {isVietnamese ? "Thư viện" : "Library"}
          </div>

          <div className="space-y-1">
            <PreviewSidebarItem active label={isVietnamese ? "Chương 12" : "Chapter 12"} />
            <PreviewSidebarItem label={isVietnamese ? "Chương 13" : "Chapter 13"} />
            <PreviewSidebarItem label={isVietnamese ? "Sổ tay truyện" : "Story bible"} />
            <PreviewSidebarItem label={isVietnamese ? "Nhân vật" : "Characters"} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-[var(--color-accent-muted)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent)]">
                {isVietnamese ? "Đang viết nháp" : "Drafting"}
              </div>
              <div className="rounded-full bg-[var(--color-surface-alt)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                {isVietnamese ? "Ghi chú nhân vật ở cạnh" : "Character notes nearby"}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {isVietnamese
                ? "Mara bước vào khu vườn và đếm lại những cái cây cô đã đánh dấu trước mùa đông."
                : "Mara stepped into the orchard and counted the trees she had marked before winter."}
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
              title={isVietnamese ? "Ghi chú cảnh" : "Scene notes"}
              detail={isVietnamese ? "Cảnh truyện đang đi về đâu" : "Where the scene is headed"}
            />
            <PreviewPanel
              icon={<Users size={16} />}
              title={isVietnamese ? "Nhân vật" : "Characters"}
              detail={isVietnamese ? "Động cơ và thay đổi gần đây" : "Motives and recent changes"}
            />
            <PreviewPanel
              icon={<Sparkles size={16} />}
              title={isVietnamese ? "Hỗ trợ viết" : "Writing help"}
              detail={isVietnamese ? "Một cú hích khi bạn cần" : "A nudge when you need it"}
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
