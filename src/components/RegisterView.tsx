"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n-client";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function RegisterView() {
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await register(name, email, password);
      router.push("/");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("register")}</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm border border-[var(--color-border)]"
        >
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <div className="space-y-5">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">
                {t("name")}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contextra User"
                required
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2",
                  "text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                )}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">
                {t("email")}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2",
                  "text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                )}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">
                {t("password")}
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2",
                  "text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                )}
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className={cn(
                "w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors",
                "bg-[var(--color-accent)] hover:opacity-90",
                "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2",
                pending && "opacity-60 cursor-not-allowed"
              )}
            >
              {pending ? ct("loading") : t("registerAction")}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
            {t("hasAccount")}{" "}
            <Link href="/login" className="font-medium text-[var(--color-accent)] hover:underline">
              {t("signIn")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
