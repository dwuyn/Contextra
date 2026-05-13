"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { X, Copy, Plus, ThumbsUp, ThumbsDown, Star, MessageSquare, History, Sparkles, Send, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

export function AiCardsPane({ onClose, showCloseButton }: { onClose?: () => void; showCloseButton?: boolean }) {
  const { 
    aiCards, 
    removeAiCard, 
    project, 
    activeBranchId 
  } = useProjectStore();
  const [activeTab, setActiveTab] = useState<"history" | "chat">("history");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !project) return;

    const userMsg = { id: Date.now().toString(), role: "user" as const, content: input };
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant" as const, content: "" }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.metadata.id,
          branchId: activeBranchId,
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
          );
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Sorry, I encountered an error. Please try again." } : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  return (
    <aside className="h-full w-96 border-l border-slate-200 bg-[var(--background)] flex flex-col">
      {/* Tabs Header */}
      <div className="flex items-center px-4 pt-4 border-b border-slate-100 bg-[var(--background)]">
        {showCloseButton && onClose && (
          <button onClick={onClose} className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all" aria-label="Close AI assistant">
            <X size={16} />
          </button>
        )}
        <button 
          onClick={() => setActiveTab("history")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
            activeTab === "history" ? "border-indigo-600 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <History size={14} />
          History
        </button>
        <button 
          onClick={() => setActiveTab("chat")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
            activeTab === "chat" ? "border-indigo-600 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <MessageSquare size={14} />
          Chat
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {activeTab === "history" ? (
          <>
            {aiCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <Plus size={24} className="text-slate-200" />
                </div>
                <p className="text-sm font-bold text-slate-900 mb-2">No history yet</p>
                <p className="text-xs text-slate-400 leading-relaxed">Highlight text and use AI tools to generate suggestions. They will appear here as cards.</p>
              </div>
            ) : (
              aiCards.map((card) => (
                <div key={card.id} className="bg-white border border-slate-100 rounded-[24px] shadow-sm overflow-hidden group hover:shadow-md transition-all">
                  <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Sparkles size={10} className="text-indigo-600" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">{card.type}</span>
                    </div>
                    <button
                      onClick={() => removeAiCard(card.id)}
                      className="text-slate-300 hover:text-slate-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {card.content}
                    </p>
                    
                    <div className="mt-6 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => useProjectStore.getState().insertContent(card.content)}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-slate-800 transition-colors"
                        >
                          <Plus size={12} />
                          Insert
                        </button>
                        <button 
                          onClick={() => navigator.clipboard.writeText(card.content)}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:bg-slate-50 transition-colors"
                        >
                          <Copy size={12} />
                          Copy
                        </button>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconButton title="Coming soon" icon={<ThumbsUp size={12} />} />
                        <IconButton title="Coming soon" icon={<ThumbsDown size={12} />} />
                        <IconButton title="Coming soon" icon={<Star size={12} />} />
                      </div>
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
                <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <MessageSquare size={24} className="text-slate-200" />
                </div>
                <p className="text-sm font-bold text-slate-900 mb-2">AI Writing Assistant</p>
                <p className="text-xs text-slate-400 leading-relaxed">Ask me anything about your story, brainstorm ideas, or ask for help with continuity.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user" 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-sm"
                  )}>
                    <div className="prose-sm max-w-none text-inherit leading-relaxed [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4">
                      <ReactMarkdown>
                        {typeof (msg as any).content === "string"
                          ? (msg as any).content
                          : ((msg as any).parts ?? []).filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || ""}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1 px-1">
                    {msg.role === "assistant" ? (
                      <div className="w-3 h-3 rounded-full bg-indigo-50 flex items-center justify-center">
                        <Sparkles size={6} className="text-indigo-600" />
                      </div>
                    ) : (
                      <User size={8} className="text-slate-300" />
                    )}
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">
                      {msg.role === "assistant" ? "Contextra AI" : "You"}
                    </span>
                  </div>
                </div>
              ))
            )}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex flex-col items-start animate-pulse">
                <div className="max-w-[85%] rounded-[20px] rounded-tl-none px-4 py-3 bg-white border border-slate-100 text-slate-300 text-sm shadow-sm">
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Input / Footer Area */}
      <div className="p-4 border-t border-slate-100 bg-white">
        {activeTab === "chat" ? (
          <form onSubmit={handleSubmit} className="relative">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Ask Contextra AI..."
              className="w-full bg-slate-50 border-none rounded-2xl pl-4 pr-12 py-3 text-sm focus:ring-1 focus:ring-indigo-600 outline-none transition-all placeholder:text-slate-400"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <button title="Coming soon" disabled className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 hover:text-slate-600 disabled:opacity-50">
              <MessageSquare size={14} />
              Support
            </button>
            <button title="Coming soon" disabled className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors disabled:opacity-50">
              Upgrade
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function IconButton({ icon, title }: { icon: React.ReactNode, title?: string }) {
  return (
    <button title={title} className="p-2 text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-lg transition-all disabled:opacity-50">
      {icon}
    </button>
  );
}
