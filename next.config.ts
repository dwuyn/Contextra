import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n.ts");

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@google-cloud/storage", "@google-cloud/text-to-speech"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  allowedDevOrigins: ["*.ngrok-free.dev"],
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const collabUrl = process.env.NEXT_PUBLIC_COLLAB_URL;
    const isProd = process.env.NODE_ENV === "production";
    const devCollabHosts = !isProd
      ? " ws://127.0.0.1:1234 ws://localhost:1234 wss://*.ngrok-free.dev"
      : "";
    const collabWs = collabUrl ? ` ${collabUrl.replace(/^http/, "ws")}` : "";
    const scriptSrc = isProd
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'";

    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload"
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' https://storage.googleapis.com data:; connect-src 'self'${devCollabHosts}${collabWs}; font-src 'self'; media-src 'self' blob:;`,
          },
        ],
      },
    ];
  },
};

export default withAnalyzer(withNextIntl(nextConfig));
