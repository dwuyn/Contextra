import type { Metadata } from "next";
import { Manrope, Literata, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PreferencesProvider } from "@/components/PreferencesProvider";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Contextra - Collaborative AI Writing Workspace",
  description: "A monolithic AI writing workspace inspired by Sudowrite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${literata.variable} ${spaceGrotesk.variable} ${mono.variable} antialiased`}>
        <PreferencesProvider>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
