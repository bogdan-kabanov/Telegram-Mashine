import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "playwright"],
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
