"use client";

import { useReducer } from "react";
import { register } from "@/actions/auth";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n-client";

type FormState = {
  name: string;
  email: string;
  password: string;
  error: string;
  pending: boolean;
};

type FormAction =
  | { type: "setField"; field: "name" | "email" | "password"; value: string }
  | { type: "setError"; error: string }
  | { type: "setPending"; pending: boolean };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "setError":
      return { ...state, error: action.error };
    case "setPending":
      return { ...state, pending: action.pending };
  }
}

export function RegisterView() {
  const t = useTranslations("auth");
  const ct = useTranslations("common");
  const locale = useLocale();
  const [form, dispatch] = useReducer(formReducer, { name: "", email: "", password: "", error: "", pending: false });

  function getErrorMessage(err: unknown) {
    return err instanceof Error ? err.message : ct("somethingWentWrong");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: "setError", error: "" });
    dispatch({ type: "setPending", pending: true });
    try {
      const result = await register(form.name, form.email, form.password);
      if (!result.ok) {
        dispatch({ type: "setError", error: result.message });
        return;
      }

      window.location.replace(`/${locale}`);
    } catch (err) {
      dispatch({ type: "setError", error: getErrorMessage(err) });
    } finally {
      dispatch({ type: "setPending", pending: false });
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
          {form.error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
            >
              {form.error}
            </div>
          )}

          <div className="space-y-5">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider mb-1.5 block text-[var(--color-text-secondary)]">
                {t("name")}
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => dispatch({ type: "setField", field: "name", value: e.target.value })}
                placeholder={t("namePlaceholder")}
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
                value={form.email}
                onChange={(e) => dispatch({ type: "setField", field: "email", value: e.target.value })}
                placeholder={t("emailPlaceholder")}
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
                value={form.password}
                onChange={(e) => dispatch({ type: "setField", field: "password", value: e.target.value })}
                placeholder={t("passwordPlaceholder")}
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
              disabled={form.pending}
              className={cn(
                "w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors",
                "bg-[var(--color-accent)] hover:opacity-90",
                "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2",
                form.pending && "opacity-60 cursor-not-allowed"
              )}
            >
              {form.pending ? ct("loading") : t("registerAction")}
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
