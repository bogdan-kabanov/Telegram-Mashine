import type { NextConfig } from "next";

/** Subpath mount (e.g. `/ai` on rekla.kz). Empty = root. Must match nginx. */
const rawBase = (process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const basePath = !rawBase || rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "playwright", "tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/tesseract.js-core/*.wasm"],
  },
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icons/telegram-input-sticker.svg",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/panel", destination: "/panel/index.html" },
      { source: "/panel/app", destination: "/panel/index.html" },
      { source: "/panel/app/:path*", destination: "/panel/index.html" },
    ];
  },
};

export default nextConfig;
