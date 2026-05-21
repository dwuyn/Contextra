"use client";

import { useState } from "react";
import { register } from "@/actions/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to create an account. Please try again.";
}

export function RegisterView() {
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await register(name, email, password);
      router.push("/");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-3 text-slate-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <BookOpen size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">Contextra</p>
            <p className="text-xs text-slate-500">Writing workspace</p>
          </div>
        </Link>

        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Create your workspace</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Start a place for chapters, notes, and character details.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="sr-only">Full name</span>
              <input
                name="name"
                type="text"
                placeholder="Full name"
                required
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
              />
            </label>
            <label className="block">
              <span className="sr-only">Email address</span>
              <input
                name="email"
                type="email"
                placeholder="Email address"
                required
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
              />
            </label>
            <label className="block">
              <span className="sr-only">Password</span>
              <input
                name="password"
                type="password"
                placeholder="Password"
                required
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-slate-900 py-4 font-bold text-white transition-colors hover:bg-slate-800 active:scale-95"
            >
              Create account
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Already have an account? Sign in
            </Link>
          </div>

          {error && (
            <p role="alert" aria-live="assertive" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-500">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
