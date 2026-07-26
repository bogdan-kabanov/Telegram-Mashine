import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "playwright"],
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
