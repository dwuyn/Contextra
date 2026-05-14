"use client";

import Link from "next/link";
import { Brain, Layers, Link2, Sparkles, Wand2, ChevronRight, BookOpen, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export function LandingView() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 font-manrope overflow-x-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/20 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <BookOpen size={16} className="text-white" />
            </div>
            <span className="text-xl font-extrabold text-white tracking-tight">Contextra</span>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-sm font-bold text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/register" 
              className="px-5 py-2.5 rounded-full bg-white text-slate-950 text-sm font-extrabold hover:bg-slate-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              Start Writing
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Sparkles size={14} />
            The ultimate storyteller's workspace
          </div>
          
          <h1 className="text-6xl md:text-8xl font-extrabold text-white tracking-tighter leading-[1.1] mb-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
            Solve the <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">infinite context</span> problem.
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            Contextra dynamically assembles your Story Bible, character states, and recent prose so your AI co-writer maintains flawless continuity across hundreds of thousands of words.
          </p>
          
          <div className="flex items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
            <Link 
              href="/register" 
              className="group flex items-center gap-2 px-8 py-4 rounded-full bg-indigo-600 text-white text-lg font-extrabold hover:bg-indigo-500 transition-all hover:shadow-[0_0_40px_rgba(79,70,229,0.4)]"
            >
              Start Writing for Free
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 px-6 relative z-10 border-t border-slate-800/50 bg-slate-900/20">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 text-center">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">A 3-Tier Memory Architecture</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Contextra automatically manages what the AI needs to know, exactly when it needs to know it.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Database size={24} className="text-blue-400" />}
              title="Core Story Bible"
              description="Your world rules, project tone, and active characters are always injected into the context window, establishing the absolute truth of your universe."
              delay={100}
            />
            <FeatureCard 
              icon={<Brain size={24} className="text-fuchsia-400" />}
              title="Semantic RAG Memory"
              description="Contextra uses pgvector to automatically retrieve highly relevant past scenes and character moments based on your current writing instructions."
              delay={200}
            />
            <FeatureCard 
              icon={<Layers size={24} className="text-emerald-400" />}
              title="Dynamic Character State"
              description="Characters evolve. Contextra tracks character motivations and memories chapter-by-chapter so they never feel out of character."
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <BookOpen size={16} />
            <span className="font-bold text-slate-300">Contextra</span>
          </div>
          <p>© 2026 Contextra. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <div 
      className={cn(
        "p-8 rounded-[32px] bg-slate-900/50 border border-slate-800 backdrop-blur-sm hover:bg-slate-800/50 transition-colors group",
        `animate-in fade-in slide-in-from-bottom-8 duration-700`
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
