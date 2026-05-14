import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[#f7f7f5] p-6 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
        <FileQuestion size={40} />
      </div>
      <h2 className="mb-2 text-3xl font-extrabold text-slate-900 tracking-tight">Project not found</h2>
      <p className="mb-8 text-sm text-slate-500 max-w-md">We couldn&apos;t find the workspace you&apos;re looking for. It may have been deleted or you don&apos;t have access.</p>
      <Link
        href="/"
        className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
