"use client";

import { useState } from "react";
import { login } from "@/actions/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";

const UNEXPECTED_LOGIN_MESSAGE = "Unable to sign in. Please try again.";

export function LoginView() {
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await login(email, password);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.push("/");
    } catch {
      setError(UNEXPECTED_LOGIN_MESSAGE);
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
          <h1 className="text-3xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Open your workspace and pick up where your story left off.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
              Sign in
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/register"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Need an account? Create one
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
