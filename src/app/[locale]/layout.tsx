import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/lib/i18n-client";

import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans";
import "@fontsource-variable/noto-serif";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/space-grotesk";

import { LocaleLangSetter } from "@/components/LocaleLangSetter";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Contextra — AI-Powered Collaborative Writing",
    template: "%s | Contextra",
  },
  description:
    "Write your next story with context-aware AI. Contextra remembers your characters, plot threads, and world-building as you write.",
  openGraph: {
    title: "Contextra — AI-Powered Collaborative Writing",
    description:
      "Write your next story with context-aware AI. Contextra remembers your characters, plot threads, and world-building as you write.",
    type: "website",
    siteName: "Contextra",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contextra — AI-Powered Collaborative Writing",
    description: "Write your next story with context-aware AI.",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const [messages, a11y] = await Promise.all([
    getMessages(),
    getTranslations("a11y"),
  ]);

  return (
    <>
      <LocaleLangSetter locale={locale} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-xl focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:bg-[var(--color-text)] focus:text-[var(--color-canvas)] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      >
        {a11y("skipToContent")}
      </a>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PreferencesProvider>
          <main id="main-content">{children}</main>
        </PreferencesProvider>
      </NextIntlClientProvider>
    </>
  );
}
