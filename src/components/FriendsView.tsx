"use client";

import Image from "next/image";
import { useCallback, useState, useEffect, useRef, useReducer } from "react";
import { MessageSquare, Search, Send } from "lucide-react";
import { getFriends } from "@/actions/friends";
import { getDirectMessages, sendDirectMessage } from "@/actions/chat";
import { useSSE } from "@/lib/hooks/useSSE";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type FriendSummary = {
  id: string;
  name: string;
  email: string;
  profileImageUrl?: string | null;
  createdAt?: string;
};

type DirectMessageSummary = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  fileName?: string | null;
  fileUrl?: string | null;
  createdAt: string | Date;
};

type FriendsState = {
  friends: FriendSummary[];
  selectedFriend: FriendSummary | null;
  unreadMap: Record<string, boolean>;
  latestMessage: DirectMessageSummary | null;
};

type FriendsAction =
  | { type: "SET_FRIENDS"; friends: FriendSummary[] }
  | { type: "SELECT_FRIEND"; friend: FriendSummary | null }
  | { type: "NEW_MESSAGE"; message: DirectMessageSummary; isSelected: boolean };

function friendsReducer(state: FriendsState, action: FriendsAction): FriendsState {
  switch (action.type) {
    case "SET_FRIENDS":
      return { ...state, friends: action.friends };
    case "SELECT_FRIEND":
      return {
        ...state,
        selectedFriend: action.friend,
        unreadMap: action.friend
          ? { ...state.unreadMap, [action.friend.id]: false }
          : state.unreadMap,
      };
    case "NEW_MESSAGE":
      return {
        ...state,
        latestMessage: action.message,
        unreadMap: !action.isSelected
          ? { ...state.unreadMap, [action.message.senderId]: true }
          : state.unreadMap,
      };
    default:
      return state;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toDirectMessage(data: Record<string, unknown>): DirectMessageSummary | null {
  const id = asString(data.id);
  const senderId = asString(data.senderId);
  const receiverId = asString(data.receiverId);
  const content = asString(data.content);
  if (!id || !senderId || !receiverId || !content) return null;

  return {
    id,
    senderId,
    receiverId,
    content,
    fileName: asString(data.fileName) ?? null,
    fileUrl: asString(data.fileUrl) ?? null,
    createdAt: asString(data.createdAt) ?? new Date(),
  };
}

export function FriendsView() {
  const t = useTranslations("friendsView");
  const [searchQuery, setSearchQuery] = useState("");

  const [state, dispatch] = useReducer(friendsReducer, {
    friends: [],
    selectedFriend: null,
    unreadMap: {},
    latestMessage: null,
  });

  const { friends, selectedFriend, unreadMap, latestMessage } = state;
  const appendMessageRef = useRef<((msg: DirectMessageSummary) => void) | null>(null);

  async function fetchFriends() {
    try {
      const data = await getFriends();
      dispatch({ type: "SET_FRIENDS", friends: data });
    } catch (err) {
      console.error("Failed to fetch friends", err);
    }
  }

  useEffect(() => {
    queueMicrotask(() => fetchFriends());
  }, []);

  useSSE((event, data) => {
    if (event === "new_message") {
      const message = toDirectMessage(data);
      if (!message) return;

      const isSelected = selectedFriend?.id === message.senderId;
      dispatch({ type: "NEW_MESSAGE", message, isSelected });
      if (isSelected) {
        appendMessageRef.current?.(message);
      }
    }
  });

  const handleSelectFriend = (friend: FriendSummary | null) => {
    dispatch({ type: "SELECT_FRIEND", friend });
  };

  const filteredFriends = friends.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{t("workspaceLabel")}</p>
          <h2 className="text-4xl font-extrabold text-[var(--color-text)] tracking-tight">{t("title")}</h2>
        </div>
        {selectedFriend ? (
          <button 
            type="button"
            onClick={() => handleSelectFriend(null)}
            className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold text-[var(--color-text)] hover:bg-[var(--color-canvas)] transition-colors shadow-sm"
          >
            {t("close")}
          </button>
        ) : null}
      </header>

      <div className="flex gap-10 flex-1 min-h-0">
        {/* Left Sidebar */}
        <div className="w-64 flex flex-col space-y-6 min-h-0">
          <div className="relative shrink-0">
            <label htmlFor="friends-search" className="sr-only">
              {t("searchLabel")}
            </label>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" size={14} />
            <input 
              id="friends-search"
              type="text" 
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-[var(--color-canvas)] border-none px-9 py-2.5 text-sm outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] sticky top-0 bg-[var(--color-canvas)]">{t("privateMessages")}</div>
            {filteredFriends.length === 0 ? (
              <p className="px-2 py-4 text-xs text-[var(--color-text-muted)] italic">{t("noFriends")}</p>
            ) : (
              <nav className="space-y-1 pb-4">
                {filteredFriends.map((friend) => (
                  <button
                    type="button"
                    key={friend.id}
                    onClick={() => handleSelectFriend(friend)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
                      selectedFriend?.id === friend.id ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-text)]"
                    )}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="h-8 w-8 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] flex items-center justify-center font-bold text-xs shrink-0">
                        {friend.name[0].toUpperCase()}
                      </div>
                      <span className="truncate">{friend.name}</span>
                    </div>
                    {unreadMap[friend.id] && (
                      <div className="h-2 w-2 rounded-full bg-[var(--color-accent)] shrink-0 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
                    )}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className={cn(
          "flex-1 flex flex-col rounded-[40px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden",
          !selectedFriend ? "items-center justify-center p-12" : ""
        )}>
          {!selectedFriend ? (
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--color-canvas)] text-[var(--color-text-muted)]">
                <MessageSquare size={40} />
              </div>
              <h3 className="text-2xl font-bold text-[var(--color-text)] mb-3">{t("chooseFriend")}</h3>
              <p className="text-[var(--color-text-muted)] leading-relaxed">{t("chooseFriendDescription")}</p>
            </div>
          ) : (
            <EmbeddedChat friend={selectedFriend} latestMessage={latestMessage} appendMessageRef={appendMessageRef} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmbeddedChat({ friend, latestMessage, appendMessageRef }: { friend: FriendSummary, latestMessage: DirectMessageSummary | null, appendMessageRef: React.MutableRefObject<((msg: DirectMessageSummary) => void) | null> }) {
  const t = useTranslations("friendsView");
  const [messages, setMessages] = useState<DirectMessageSummary[]>([]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const friendInitial = friend.name.charAt(0).toUpperCase();

  useEffect(() => {
    appendMessageRef.current = (msg: DirectMessageSummary) => {
      setMessages((prev) => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    return () => {
      appendMessageRef.current = null;
    };
  }, [appendMessageRef]);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getDirectMessages(friend.id);
      setMessages(data);
    } catch (err) {
      console.error("Failed to fetch messages", err);
    }
  }, [friend.id]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchMessages();
    });
  }, [fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const content = inputValue;
    setInputValue("");

    try {
      const newMessage = await sendDirectMessage(friend.id, content);
      setMessages((prev) => [...prev, newMessage]);
    } catch (err) {
      console.error("Failed to send message", err);
    }
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Profile Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-muted)] text-base font-bold text-[var(--color-accent)] shadow-inner">
          {friend.profileImageUrl ? (
            <Image
              src={friend.profileImageUrl}
              alt={friend.name}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          ) : (
            friendInitial
          )}
        </div>
        <h3 className="truncate text-xl font-extrabold tracking-tight text-[var(--color-text)]">
          {friend.name}
        </h3>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--color-canvas)]">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-40">
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">{t("noMessages")}</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{t("sayHello", { name: friend.name })}</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div 
              key={msg.id || idx} 
              className={cn(
                "flex flex-col max-w-[70%]",
                msg.senderId === friend.id ? "items-start" : "items-end ml-auto"
              )}
            >
              <div className={cn(
                "px-5 py-3.5 rounded-[24px] text-[15px] leading-relaxed",
                msg.senderId === friend.id 
                  ? "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-md shadow-sm" 
                  : "bg-[var(--color-accent)] text-white rounded-tr-md shadow-sm"
              )}>
                {msg.content}
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] mt-1.5 uppercase font-bold tracking-wider px-1">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-[var(--color-surface)] border-t border-[var(--color-border)] shrink-0">
        <form onSubmit={handleSendMessage} className="relative flex items-center gap-3">
          <label htmlFor="friend-message-input" className="sr-only">
            {t("messageLabel", { name: friend.name })}
          </label>
          <input 
            id="friend-message-input"
            type="text" 
            placeholder={t("messagePlaceholder")}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-2xl px-5 py-3.5 text-sm outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] transition-colors"
          />
          <button 
            type="submit"
            aria-label={t("sendMessageTo", { name: friend.name })}
            disabled={!inputValue.trim()}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)] disabled:opacity-50 disabled:hover:bg-[var(--color-accent)] transition-all shadow-sm shrink-0"
          >
            <Send aria-hidden="true" size={18} className="translate-x-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
