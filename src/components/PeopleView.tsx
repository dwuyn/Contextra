"use client";

import { useState, useEffect } from "react";
import { Search, UserPlus, ArrowRight, X } from "lucide-react";
import { searchPeople, discoverPeople } from "@/actions/people";
import { sendFriendRequest, getFriendRequests, respondToFriendRequest } from "@/actions/friends";
import { useSSE } from "@/lib/hooks/useSSE";
import { cn } from "@/lib/utils";

export function PeopleView({ onClose }: { onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [discoveredPeople, setDiscoveredPeople] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"directory" | "incoming" | "outgoing">("directory");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useSSE((event, data) => {
    if (event === "new_friend_request") {
      setIncomingRequests(prev => {
        if (prev.some(r => r.id === data.id)) return prev;
        // Make sure data has all required fields for rendering
        return [data, ...prev];
      });
    } else if (event === "friend_request_status_update") {
      setOutgoingRequests(prev => prev.filter(r => r.id !== data.id));
    }
  });

  async function fetchInitialData() {
    setLoading(true);
    try {
      const [discovered, incoming, outgoing] = await Promise.all([
        discoverPeople(),
        getFriendRequests("incoming"),
        getFriendRequests("outgoing")
      ]);
      setDiscoveredPeople(discovered);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err) {
      console.error("Failed to fetch people data", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const results = await searchPeople(searchQuery);
      setSearchResults(results);
      setActiveTab("directory"); // Switch to directory to show results
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRequest(userId: string) {
    try {
      await sendFriendRequest(userId);
      // Refresh outgoing requests
      const outgoing = await getFriendRequests("outgoing");
      setOutgoingRequests(outgoing);
      // Update discovered/search results optimistically
      setDiscoveredPeople(prev => prev.filter(p => p.id !== userId));
      setSearchResults(prev => prev.map(p => p.id === userId ? { ...p, hasPendingRequest: true } : p));
    } catch (err) {
      console.error("Failed to send request", err);
    }
  }

  async function handleAccept(requestId: string) {
    // Optimistic UI update
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
    
    try {
      await respondToFriendRequest(requestId, "accepted");
    } catch (err) {
      console.error("Failed to accept request", err);
      // Revert optimistic change on error
      const incoming = await getFriendRequests("incoming");
      setIncomingRequests(incoming);
    }
  }

  async function handleReject(requestId: string) {
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
    try {
      await respondToFriendRequest(requestId, "rejected");
    } catch (err) {
      console.error("Failed to reject request", err);
      const incoming = await getFriendRequests("incoming");
      setIncomingRequests(incoming);
    }
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Workspace</p>
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">People</h2>
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
        <div className="w-64 space-y-6">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Find by email" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-slate-50 border-none px-9 py-2.5 text-sm outline-none placeholder:text-slate-400"
            />
          </form>

          <nav className="space-y-1">
            <SidebarItem 
              label="Directory" 
              count={discoveredPeople.length} 
              active={activeTab === "directory"} 
              onClick={() => setActiveTab("directory")} 
            />
            <SidebarItem 
              label="Incoming requests" 
              count={incomingRequests.length} 
              active={activeTab === "incoming"} 
              onClick={() => setActiveTab("incoming")} 
            />
            <SidebarItem 
              label="Outgoing requests" 
              count={outgoingRequests.length} 
              active={activeTab === "outgoing"} 
              onClick={() => setActiveTab("outgoing")} 
            />
          </nav>
        </div>

        {/* Main Area */}
        <div className="flex-1 overflow-y-auto pr-4">
          {activeTab === "directory" && (
            <div className="space-y-10">
              {searchResults.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-slate-900">Search results</h3>
                    <button onClick={() => setSearchResults([])} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {searchResults.map((person) => (
                      <PersonCard 
                        key={person.id} 
                        person={person} 
                        onSendRequest={() => handleSendRequest(person.id)} 
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-900">Discover people</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                    {discoveredPeople.length} users
                  </span>
                </div>
                
                {discoveredPeople.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 rounded-[32px] border border-dashed border-slate-200 bg-slate-50">
                    <UsersIcon size={40} className="text-slate-200 mb-4" />
                    <p className="text-sm text-slate-400">No new people to discover right now.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {discoveredPeople.map((person) => (
                      <PersonCard 
                        key={person.id} 
                        person={person} 
                        onSendRequest={() => handleSendRequest(person.id)} 
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "incoming" && (
            <section>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Incoming requests</h3>
              {incomingRequests.length === 0 ? (
                <div className="p-8 rounded-[32px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-400">
                  No incoming requests right now.
                </div>
              ) : (
                <div className="space-y-4">
                  {incomingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-5 rounded-[24px] bg-white border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                          {(req.senderName || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{req.senderName || "Unknown"}</p>
                          <p className="text-sm text-slate-400">{req.senderEmail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handleAccept(req.id)}
                          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          Accept
                        </button>
                        <button 
                          onClick={() => handleReject(req.id)}
                          className="text-slate-300 hover:text-slate-500 p-2"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "outgoing" && (
            <section>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Outgoing requests</h3>
              {outgoingRequests.length === 0 ? (
                <div className="p-8 rounded-[32px] border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-400">
                  No outgoing requests right now.
                </div>
              ) : (
                <div className="space-y-4">
                  {outgoingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-5 rounded-[24px] bg-white border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center font-bold text-lg">
                          {(req.receiverName || req.receiverEmail || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{req.receiverName || req.receiverEmail}</p>
                          <p className="text-sm text-slate-400">{req.receiverEmail}</p>
                          <p className="text-[10px] text-slate-400 italic mt-1">Sent on {new Date(req.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg">
                        PENDING
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ label, count, active, onClick }: { label: string, count: number, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition-all",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      )}
    >
      {label}: {count}
    </button>
  );
}

function PersonCard({ person, onSendRequest }: { person: any, onSendRequest: () => void }) {
  return (
    <div className="group flex flex-col p-6 rounded-[28px] bg-white border border-slate-100 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center gap-4 mb-6">
        {person.profileImageUrl ? (
          <img src={person.profileImageUrl} alt={person.name} className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center font-bold text-xl uppercase">
            {person.name.substring(0, 2)}
          </div>
        )}
        <div className="min-w-0">
          <h4 className="font-bold text-slate-900 truncate">{person.name}</h4>
          <p className="text-xs text-slate-400 truncate">{person.email}</p>
        </div>
      </div>
      
      {person.isFriend ? (
        <div className="flex items-center gap-2 text-xs font-bold text-green-500 bg-green-50 px-4 py-2.5 rounded-xl justify-center">
          Already friends
        </div>
      ) : person.hasPendingRequest ? (
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2.5 rounded-xl justify-center">
          Request pending
        </div>
      ) : (
        <button 
          onClick={onSendRequest}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
        >
          Send request
        </button>
      )}
    </div>
  );
}

function UsersIcon({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
