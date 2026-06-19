import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contextra",
  description:
    "Write your next story with context-aware AI. Contextra remembers your characters, plot threads, and world-building as you write.",
};

export default function RootPage() {
  redirect("/en");
}
