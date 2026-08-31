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
  // Next file tracing copies JS from tesseract.js-core but skips .wasm binaries.
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/tesseract.js-core/*.wasm"],
  },
  // Next 15.5 Segment Explorer crashes the client with:
  // Cannot read properties of undefined (reading 'page.tsx')
  // (next-devtools segmentExplorerNodeAdd)
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
  // OneDrive sync corrupts webpack HMR; disable persistent cache in dev.
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
};

export default nextConfig;
