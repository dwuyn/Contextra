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
import { useState, useRef, useEffect, startTransition } from "react";
import { useRouter } from "@/lib/i18n-client";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";

export type AiCardsPaneTab = "history" | "chat";

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
  const messages = useProjectStore((state) => state.project?.aiMessages ?? []);
  const activeBranchId = useProjectStore((state) => state.activeBranchId);
  const appendProjectAiMessage = useProjectStore((state) => state.appendProjectAiMessage);
  const updateProjectAiMessage = useProjectStore((state) => state.updateProjectAiMessage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Missing AI response stream.");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        updateProjectAiMessage(assistantMessageId, { content: accumulated });
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
    <aside className="h-full w-96 border-l border-[var(--color-border)] bg-[var(--background)] flex flex-col">
      {/* Tabs Header */}
      <div className="flex items-center px-4 pt-4 border-b border-[var(--color-border)] bg-[var(--background)]">
        {showCloseButton && onClose && (
          <button type="button" onClick={onClose} className="mr-2 p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-all" aria-label={t("close")}>
            <X size={16} />
          </button>
        )}
        <button 
          type="button"
          onClick={() => handleTabChange("history")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
            activeTab === "history" ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          <History size={14} />
          {t("history")}
        </button>
        <button 
          type="button"
          onClick={() => handleTabChange("chat")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
            activeTab === "chat" ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          <MessageSquare size={14} />
          {t("chat")}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {activeTab === "history" ? (
          <>
            {aiCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-16 h-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <Plus size={24} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-sm font-bold text-[var(--color-text)] mb-2">{t("emptyHistoryTitle")}</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t("emptyHistoryDescription")}</p>
              </div>
            ) : (
              aiCards.map((card) => (
                <div key={card.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[24px] shadow-sm overflow-hidden group hover:shadow-md transition-all">
                  <div className="px-5 py-3 bg-[var(--color-surface-alt)] border-b border-[var(--color-border)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center",
                        card.status === "loading" && "bg-amber-100",
                        card.status === "ready" && "bg-[var(--color-accent-muted)]",
                        card.status === "error" && "bg-[var(--color-destructive)]/10",
                      )}>
                        {card.status === "loading" ? (
                          <Loader2 size={10} className="animate-spin text-amber-600" />
                        ) : card.status === "error" ? (
                          <AlertCircle size={10} className="text-[var(--color-destructive)]" />
                        ) : (
                          <Sparkles size={10} className="text-[var(--color-accent)]" />
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-tighter text-[var(--color-text-muted)]">{card.type}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAiCard(card.id)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
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
                              onClick={() => useProjectStore.getState().insertContent(card.content)}
                              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-text)] text-[var(--color-surface)] rounded-xl text-[10px] font-black uppercase tracking-tighter hover:opacity-90 transition-colors"
                            >
                              <Plus size={12} />
                              {t("insert")}
                            </button>
                            <button 
                              type="button"
                              onClick={() => navigator.clipboard.writeText(card.content)}
                              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-[var(--color-surface-alt)] transition-colors"
                          >
                            <Copy size={12} />
                            {t("copy")}
                          </button>
                        </div>
                      ) : (
                        <div className={cn(
                          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                          card.status === "loading" ? "bg-amber-50 text-amber-700" : "bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]",
                        )}>
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
              ))
            )}
          </>
        ) : (
          <div className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-16 h-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <MessageSquare size={24} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-sm font-bold text-[var(--color-text)] mb-2">{t("emptyChatTitle")}</p>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t("emptyChatDescription")}</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user" 
                      ? "bg-[var(--color-accent)] text-white rounded-tr-none" 
                      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-none shadow-sm"
                  )}>
                    <div className="prose-sm max-w-none text-inherit leading-relaxed [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4">
                      <ReactMarkdown>{msg.content || (isLoading && msg.role === "assistant" ? t("thinking") : "")}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1 px-1">
                    {msg.role === "assistant" ? (
                      <div className="w-3 h-3 rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center">
                        <Sparkles size={6} className="text-[var(--color-accent)]" />
                      </div>
                    ) : (
                      <User size={8} className="text-[var(--color-text-muted)]" />
                    )}
                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {msg.role === "assistant" ? t("assistantName") : t("you")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      
      {/* Input / Footer Area */}
      <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        {activeTab === "chat" && (
          <form onSubmit={handleSubmit} className="relative">
            <label htmlFor="ai-chat-input" className="sr-only">
              {t("inputLabel")}
            </label>
            <input 
              id="ai-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder={t("inputPlaceholder")}
              className="w-full bg-[var(--color-surface-alt)] border-none rounded-2xl pl-4 pr-12 py-3 text-sm focus:ring-1 focus:ring-[var(--color-accent)] outline-none transition-all placeholder:text-[var(--color-text-muted)]"
            />
            <button 
              type="submit"
              aria-label={t("sendMessage")}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-[var(--color-text)] text-[var(--color-surface)] flex items-center justify-center hover:opacity-90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send aria-hidden="true" size={14} />
            </button>
          </form>
        )}
      </div>
    </aside>
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
