"use client";

import { useProjectStore, type AiHistoryCard } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import {
  X,
  Copy,
  Plus,
  MessageSquare,
  History,
  Sparkles,
  Send,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, startTransition } from "react";
import { useRouter } from "@/lib/i18n-client";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";

export type AiCardsPaneTab = "history" | "chat";

async function readStreamToCompletion(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const { done, value } = await reader.read();
  if (done) {
    return;
  }

  onChunk(decoder.decode(value, { stream: true }));
  await readStreamToCompletion(reader, decoder, onChunk);
}

export function AiCardsPane({
  activeTab,
  onTabChange,
  onClose,
  showCloseButton,
}: {
  activeTab: AiCardsPaneTab;
  onTabChange: (tab: AiCardsPaneTab) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
}) {
  const t = useTranslations("aiPane");
  const aiCards = useProjectStore((state) => state.aiCards);
  const removeAiCard = useProjectStore((state) => state.removeAiCard);
  const projectId = useProjectStore((state) => state.project?.metadata.id ?? null);
  const aiMessages = useProjectStore((state) => state.project?.aiMessages ?? null);
  const activeBranchId = useProjectStore((state) => state.activeBranchId);
  const appendProjectAiMessage = useProjectStore((state) => state.appendProjectAiMessage);
  const updateProjectAiMessage = useProjectStore((state) => state.updateProjectAiMessage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messages = useMemo(
    () => aiMessages?.filter((msg) => msg.branchId === activeBranchId) ?? [],
    [activeBranchId, aiMessages],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || !projectId || !activeBranchId) return;

    const now = Date.now();
    const userMessageId = `optimistic-user-${now}`;
    const assistantMessageId = `optimistic-assistant-${now}`;

    appendProjectAiMessage({
      id: userMessageId,
      projectId,
      branchId: activeBranchId,
      authorUserId: null,
      role: "user",
      content: trimmedInput,
      createdAt: new Date().toISOString(),
    });
    appendProjectAiMessage({
      id: assistantMessageId,
      projectId,
      branchId: activeBranchId,
      authorUserId: null,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    });
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/project-ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          branchId: activeBranchId,
          content: trimmedInput,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      if (!res.body) throw new Error("Missing AI response stream.");

      const decoder = new TextDecoder();
      let accumulated = "";

      const reader = res.body.getReader();
      try {
        await readStreamToCompletion(reader, decoder, (chunk) => {
          accumulated += chunk;
          updateProjectAiMessage(assistantMessageId, { content: accumulated });
        });
      } finally {
        reader.releaseLock();
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      console.error(err);
      updateProjectAiMessage(assistantMessageId, {
        content: t("streamError"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab: AiCardsPaneTab) => {
    onTabChange(tab);
    if (tab === "history") {
      scrollRef.current?.scrollTo({ top: 0 });
    } else {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  };

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = 0;
  }, [aiCards]);

  return (
    <aside className="flex h-full w-96 flex-col border-l border-[var(--color-border)] bg-[var(--background)]">
      <AiCardsPaneHeader
        activeTab={activeTab}
        onClose={onClose}
        onTabChange={handleTabChange}
        t={t}
        showCloseButton={showCloseButton}
      />
      <div ref={scrollRef} className="scroll-smooth flex-1 overflow-y-auto p-4">
        {activeTab === "history" ? (
          <AiCardsHistoryTab
            aiCards={aiCards}
            onRemoveCard={removeAiCard}
            t={t}
            onInsert={(content) => useProjectStore.getState().insertContent(content)}
          />
        ) : (
          <AiCardsChatTab messages={messages} isLoading={isLoading} t={t} />
        )}
      </div>
      <AiCardsPaneFooter
        activeTab={activeTab}
        input={input}
        isLoading={isLoading}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        t={t}
      />
    </aside>
  );
}

function AiCardsPaneHeader({
  activeTab,
  onTabChange,
  onClose,
  showCloseButton,
  t,
}: {
  activeTab: AiCardsPaneTab;
  onTabChange: (tab: AiCardsPaneTab) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center border-b border-[var(--color-border)] bg-[var(--background)] px-4 pt-4">
      {showCloseButton && onClose && (
        <button type="button" onClick={onClose} className="mr-2 rounded-lg p-1.5 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]" aria-label={t("close")}>
          <X size={16} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onTabChange("history")}
        className={cn(
          "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all",
          activeTab === "history" ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        <History size={14} />
        {t("history")}
      </button>
      <button
        type="button"
        onClick={() => onTabChange("chat")}
        className={cn(
          "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all",
          activeTab === "chat" ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        <MessageSquare size={14} />
        {t("chat")}
      </button>
    </div>
  );
}

function AiCardsHistoryTab({
  aiCards,
  onRemoveCard,
  onInsert,
  t,
}: {
  aiCards: AiHistoryCard[];
  onRemoveCard: (id: string) => void;
  onInsert: (content: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (aiCards.length === 0) {
    return <EmptyHistoryState t={t} />;
  }

  return (
    <div className="space-y-6">
      {aiCards.map((card) => (
        <AiHistoryCardItem key={card.id} card={card} onRemoveCard={onRemoveCard} onInsert={onInsert} t={t} />
      ))}
    </div>
  );
}

function AiHistoryCardItem({
  card,
  onRemoveCard,
  onInsert,
  t,
}: {
  card: AiHistoryCard;
  onRemoveCard: (id: string) => void;
  onInsert: (content: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="group overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-5 py-3">
        <div className="flex items-center gap-2">
          <CardStatusIcon status={card.status} />
          <span className="text-[10px] font-black uppercase tracking-tighter text-[var(--color-text-muted)]">{card.type}</span>
        </div>
        <button
          type="button"
          onClick={() => onRemoveCard(card.id)}
          className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
          aria-label={t("removeHistoryCard")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-5" aria-busy={card.status === "loading"}>
        <HistoryCardBody card={card} />
        <div className="mt-6 flex items-center justify-between">
          {card.status === "ready" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onInsert(card.content)}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-text)] px-4 py-2 text-[10px] font-black uppercase tracking-tighter text-[var(--color-surface)] transition-colors hover:opacity-90"
              >
                <Plus size={12} />
                {t("insert")}
              </button>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(card.content)}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[10px] font-black uppercase tracking-tighter text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-alt)]"
              >
                <Copy size={12} />
                {t("copy")}
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                card.status === "loading" ? "bg-amber-50 text-amber-700" : "bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]",
              )}
            >
              {card.status === "loading" ? (
                <>
                  <Loader2 size={10} className="animate-spin" />
                  {t("working")}
                </>
              ) : (
                <>
                  <AlertCircle size={10} />
                  {t("failed")}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyHistoryState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <Plus size={24} className="text-[var(--color-text-muted)]" />
      </div>
      <p className="mb-2 text-sm font-bold text-[var(--color-text)]">{t("emptyHistoryTitle")}</p>
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{t("emptyHistoryDescription")}</p>
    </div>
  );
}

function AiCardsChatTab({
  messages,
  isLoading,
  t,
}: {
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
  isLoading: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  if (messages.length === 0) {
    return <EmptyChatState t={t} />;
  }

  return (
    <div className="space-y-4 pb-4">
      {messages.map((msg) => (
        <AiChatMessage key={msg.id} message={msg} isLoading={isLoading} t={t} />
      ))}
    </div>
  );
}

function AiChatMessage({
  message,
  isLoading,
  t,
}: {
  message: { id: string; role: "user" | "assistant"; content: string };
  isLoading: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed",
          message.role === "user"
            ? "rounded-tr-none bg-[var(--color-accent)] text-white"
            : "rounded-tl-none border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm",
        )}
      >
        <div className="prose-sm max-w-none leading-relaxed text-inherit [&>ol]:pl-4 [&>ul]:list-disc [&>ul]:pl-4 [&>p]:mb-2 last:[&>p]:mb-0 [&>ol]:list-decimal [&>ol]:pl-4">
          <ReactMarkdown>{message.content || (isLoading && message.role === "assistant" ? t("thinking") : "")}</ReactMarkdown>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1 px-1">
        {message.role === "assistant" ? (
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[var(--color-accent-muted)]">
            <Sparkles size={6} className="text-[var(--color-accent)]" />
          </div>
        ) : (
          <User size={8} className="text-[var(--color-text-muted)]" />
        )}
        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          {message.role === "assistant" ? t("assistantName") : t("you")}
        </span>
      </div>
    </div>
  );
}

function EmptyChatState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <MessageSquare size={24} className="text-[var(--color-text-muted)]" />
      </div>
      <p className="mb-2 text-sm font-bold text-[var(--color-text)]">{t("emptyChatTitle")}</p>
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{t("emptyChatDescription")}</p>
    </div>
  );
}

function AiCardsPaneFooter({
  activeTab,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  t,
}: {
  activeTab: AiCardsPaneTab;
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to compute scrollHeight accurately
    textarea.style.height = "auto";
    // Set height based on scrollHeight, up to a max-height of 160px
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      const form = e.currentTarget.form;
      if (form) {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
          if (submitBtn) {
            submitBtn.click();
          }
        }
      }
    }
  };

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {activeTab === "chat" && (
        <form onSubmit={onSubmit} className="relative">
          <label htmlFor="ai-chat-input" className="sr-only">
            {t("inputLabel")}
          </label>
          <textarea
            ref={textareaRef}
            id="ai-chat-input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={t("inputPlaceholder")}
            rows={1}
            className="w-full rounded-2xl border-none bg-[var(--color-surface-alt)] pl-4 pr-12 py-3 text-sm outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:ring-1 focus:ring-[var(--color-accent)] resize-none overflow-y-auto"
          />
          <button
            type="submit"
            aria-label={t("sendMessage")}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 bottom-[6px] flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-text)] text-[var(--color-surface)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Send aria-hidden="true" size={14} />
          </button>
        </form>
      )}
    </div>
  );
}

function CardStatusIcon({ status }: { status: AiHistoryCard["status"] }) {
  return (
    <div
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full",
        status === "loading" && "bg-amber-100",
        status === "ready" && "bg-[var(--color-accent-muted)]",
        status === "error" && "bg-[var(--color-destructive)]/10",
      )}
    >
      {status === "loading" ? (
        <Loader2 size={10} className="animate-spin text-amber-600" />
      ) : status === "error" ? (
        <AlertCircle size={10} className="text-[var(--color-destructive)]" />
      ) : (
        <Sparkles size={10} className="text-[var(--color-accent)]" />
      )}
    </div>
  );
}

function HistoryCardBody({ card }: { card: AiHistoryCard }) {
  if (card.status === "loading") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
        <Loader2 size={16} className="mt-0.5 animate-spin text-amber-600" />
        <p className="text-sm font-medium leading-relaxed text-amber-900 whitespace-pre-wrap">
          {card.content}
        </p>
      </div>
    );
  }

  if (card.status === "error") {
    return (
      <div className="rounded-2xl border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="mt-0.5 text-[var(--color-destructive)]" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-relaxed text-[var(--color-destructive)] whitespace-pre-wrap">
              {card.content}
            </p>
            {card.errorMessage ? (
              <p className="text-xs leading-relaxed text-[var(--color-destructive)]">
                {card.errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
      {card.content}
    </p>
  );
}
