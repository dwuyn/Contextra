"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[#f7f7f5] p-6 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 text-red-500">
        <AlertCircle size={40} />
      </div>
      <h2 className="mb-2 text-3xl font-extrabold text-slate-900 tracking-tight">Something went wrong!</h2>
      <p className="mb-8 text-sm text-slate-500 max-w-md">{error.message || "An unexpected error occurred in the workspace."}</p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => reset()}
          className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
