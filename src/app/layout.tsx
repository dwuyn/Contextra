import type { Metadata } from "next";
import "./globals.css";
import { PreferencesProvider } from "@/components/PreferencesProvider";

export const metadata: Metadata = {
  title: "Contextra - Collaborative AI Writing Workspace",
  description: "A monolithic AI writing workspace inspired by Contextra.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PreferencesProvider>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
