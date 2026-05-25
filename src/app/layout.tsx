import type { Metadata } from "next";
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
      (function() {
        try {
          var stored = localStorage.getItem('contextra-preferences');
          if (stored) {
            var prefs = JSON.parse(stored);
            var html = document.documentElement;
            html.className = html.className
              .split(/\\s+/)
              .filter(function(c) { return !/^(theme-|font-)/.test(c); })
              .join(' ');
            var theme = prefs.state && prefs.state.theme;
            if (theme) {
              html.classList.add('theme-' + theme);
            }
            var font = prefs.state && prefs.state.font;
            if (font) {
              html.classList.add('font-' + font);
            }
          }
        } catch(e) {}
      })();
    `,
          }}
        />
      </head>
      <body className="antialiased">
        <PreferencesProvider>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
