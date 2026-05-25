export default function Loading() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f7f7f5]">
      {/* Sidebar Skeleton */}
      <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white p-4">
        <div className="mb-4 h-4 w-24 rounded bg-slate-100 animate-pulse" />
        <div className="mb-8 h-6 w-48 rounded bg-slate-200 animate-pulse" />
        
        <div className="mb-2 h-8 w-full rounded-xl bg-slate-100 animate-pulse" />
        <div className="mb-4 h-8 w-full rounded-xl bg-slate-100 animate-pulse" />
        
        <div className="flex-1 space-y-2 mt-4">
          <div className="h-10 w-full rounded-xl bg-slate-50 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-50 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-50 animate-pulse" />
        </div>
      </aside>

      {/* Main Editor Skeleton */}
      <main className="flex-1 overflow-hidden bg-white px-20 py-16">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="h-12 w-3/4 rounded-xl bg-slate-100 animate-pulse mb-12" />
          
          <div className="h-4 w-full rounded bg-slate-50 animate-pulse" />
          <div className="h-4 w-full rounded bg-slate-50 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-slate-50 animate-pulse" />
          <div className="h-4 w-4/6 rounded bg-slate-50 animate-pulse" />
          <br />
          <div className="h-4 w-full rounded bg-slate-50 animate-pulse" />
          <div className="h-4 w-11/12 rounded bg-slate-50 animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-slate-50 animate-pulse" />
        </div>
      </main>

      {/* AI Pane Skeleton */}
      <aside className="h-full w-96 border-l border-slate-200 bg-white p-4">
        <div className="flex gap-4 mb-6">
          <div className="h-6 w-20 rounded bg-slate-100 animate-pulse" />
          <div className="h-6 w-20 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="h-32 w-full rounded-2xl bg-slate-50 animate-pulse" />
          <div className="h-32 w-full rounded-2xl bg-slate-50 animate-pulse" />
        </div>
      </aside>
    </div>
  );
}
