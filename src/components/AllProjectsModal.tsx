"use client";

import { useState, useEffect } from "react";
import { listProjects, listPublicProjects } from "@/actions/projects";
import { X, Search, Globe, Lock, Clock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function AllProjectsModal({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [publicProjects, setPublicProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"my" | "public">("my");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [myResponse, publicResponse] = await Promise.all([
          listProjects(),
          listPublicProjects()
        ]);
        setProjects(myResponse);
        setPublicProjects(publicResponse);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const displayProjects = activeTab === "my" ? projects : publicProjects;

  const filteredProjects = displayProjects.filter((p) => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[85vh] rounded-[32px] bg-white shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white z-10">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Explore Projects</h2>
            <p className="text-sm text-slate-500 mt-1">Manage your workspaces and discover stories</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 gap-4 border-b border-slate-100 bg-slate-50/30">
          <div className="flex bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("my")}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === "my" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              My Projects
            </button>
            <button
              onClick={() => setActiveTab("public")}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === "public" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Public Library
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl bg-white border border-slate-200 px-10 py-2.5 text-sm outline-none focus:border-indigo-500 transition-colors shadow-sm"
            />
          </div>
        </div>

        {/* Project Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[var(--background)]">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin"></div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                <Search size={32} />
              </div>
              <p className="text-sm font-bold text-slate-900">No {activeTab === "my" ? "personal projects" : "public projects"} found.</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or creating something new.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <Link key={project.id} href={`/project/${project.id}`}>
                  <div className="group relative flex aspect-[4/3] flex-col rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
                    <div className="mb-auto flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-lg">
                        {project.name[0].toUpperCase()}
                      </div>
                      <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        project.isPublic 
                          ? "bg-green-50 text-green-600 border border-green-100" 
                          : "bg-slate-50 text-slate-500 border border-slate-100"
                      )}>
                        {project.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                        {project.isPublic ? "Public" : "Private"}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1.5 truncate">{project.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                        {activeTab === "public" ? `by ${project.ownerName}` : (project.summary || "No summary provided.")}
                      </p>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <Clock size={12} />
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </div>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase">
                          {project.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
