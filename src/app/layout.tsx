import type { Viewport } from "next";
import Script from "next/script";

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Theme preference injection — trusted static script, no user input */}
        <Script
          id="theme-prefs"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function() {
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
})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
