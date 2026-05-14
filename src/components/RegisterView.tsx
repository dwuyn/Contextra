"use client";

import { useState } from "react";
import { register } from "@/actions/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-slate-900">Create account</h1>
        <p className="mt-2 text-sm text-slate-500">To start your monolithic Sudowrite experience.</p>
        
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
            className="w-full rounded-2xl bg-slate-900 py-4 font-bold text-white transition-transform active:scale-95"
          >
            Create account
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Have an account? Login
          </Link>
        </div>

        {error && <p className="mt-4 text-sm text-red-500 bg-red-50 p-3 rounded-xl">{error}</p>}
      </div>
    </div>
  );
}
