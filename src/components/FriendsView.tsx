"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Search, Send, User } from "lucide-react";
import { getFriends } from "@/actions/friends";
import { getDirectMessages, sendDirectMessage } from "@/actions/chat";
import { useSSE } from "@/lib/hooks/useSSE";
import { cn } from "@/lib/utils";

export function FriendsView({ onClose }: { onClose: () => void }) {
  const [friends, setFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [latestMessage, setLatestMessage] = useState<any>(null);

  useEffect(() => {
    fetchFriends();
  }, []);

  useSSE((event, data) => {
    if (event === "new_message") {
      setLatestMessage(data);
      // If the message is not from the currently selected friend, mark as unread
      if (selectedFriend?.id !== data.senderId) {
        setUnreadMap(prev => ({ ...prev, [data.senderId]: true }));
      }
    }
  });

  const handleSelectFriend = (friend: any) => {
    setSelectedFriend(friend);
    setUnreadMap(prev => ({ ...prev, [friend.id]: false }));
  };

  async function fetchFriends() {
    setLoading(true);
    try {
      const data = await getFriends();
      setFriends(data);
    } catch (err) {
      console.error("Failed to fetch friends", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredFriends = friends.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Workspace</p>
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Friends</h2>
        </div>
        <button 
          onClick={onClose}
          className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
        >
          Close
        </button>
      </header>

      <div className="flex gap-10 flex-1 min-h-0">
        {/* Left Sidebar */}
        <div className="w-64 flex flex-col space-y-6 min-h-0">
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search friends" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-slate-50 border-none px-9 py-2.5 text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sticky top-0 bg-[var(--background)]">Private messages</div>
            {filteredFriends.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-400 italic">No friends yet. Use People to send friend requests.</p>
            ) : (
              <nav className="space-y-1 pb-4">
                {filteredFriends.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => handleSelectFriend(friend)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
                      selectedFriend?.id === friend.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                        {friend.name[0].toUpperCase()}
                      </div>
                      <span className="truncate">{friend.name}</span>
                    </div>
                    {unreadMap[friend.id] && (
                      <div className="h-2 w-2 rounded-full bg-blue-600 shrink-0 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
                    )}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className={cn(
          "flex-1 flex flex-col rounded-[40px] border border-slate-100 bg-white shadow-sm overflow-hidden",
          !selectedFriend ? "items-center justify-center p-12" : ""
        )}>
          {!selectedFriend ? (
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 text-slate-200">
                <MessageSquare size={40} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Choose a friend</h3>
              <p className="text-slate-400 leading-relaxed">Select one of your connected friends from the sidebar to open a private chat.</p>
            </div>
          ) : (
            <EmbeddedChat friend={selectedFriend} latestMessage={latestMessage} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmbeddedChat({ friend, latestMessage }: { friend: any, latestMessage: any }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
  }, [friend.id]);

  useEffect(() => {
    if (latestMessage && latestMessage.senderId === friend.id) {
      setMessages((prev) => {
        // Prevent duplicate messages
        if (prev.some(m => m.id === latestMessage.id)) return prev;
        return [...prev, latestMessage];
      });
    }
  }, [latestMessage, friend.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchMessages() {
    try {
      const data = await getDirectMessages(friend.id);
      setMessages(data);
    } catch (err) {
      console.error("Failed to fetch messages", err);
    }
  }

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
      <div className="flex flex-col items-center justify-center pt-8 pb-6 border-b border-slate-100 bg-white shrink-0">
        <div className="h-20 w-20 rounded-[24px] bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-3xl mb-4 relative shadow-inner">
          {friend.name[0].toUpperCase()}
          <div className="absolute bottom-0 right-0 translate-x-1 translate-y-1 h-5 w-5 rounded-full bg-green-500 border-[3px] border-white"></div>
        </div>
        <h3 className="text-xl font-extrabold text-slate-900 mb-1">{friend.name}</h3>
        <p className="text-sm text-slate-400">{friend.email}</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--background)]">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-40">
            <p className="text-sm font-medium text-slate-600">No messages yet.</p>
            <p className="text-xs text-slate-500 mt-1">Say hello to {friend.name}!</p>
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
                  ? "bg-white border border-slate-100 text-slate-900 rounded-tl-md shadow-sm" 
                  : "bg-blue-600 text-white rounded-tr-md shadow-sm"
              )}>
                {msg.content}
              </div>
              <span className="text-[10px] text-slate-400 mt-1.5 uppercase font-bold tracking-wider px-1">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100 shrink-0">
        <form onSubmit={handleSendMessage} className="relative flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Type a message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim()}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-sm shrink-0"
          >
            <Send size={18} className="translate-x-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
