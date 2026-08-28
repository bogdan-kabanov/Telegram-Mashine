"use client";

import { useEffect } from "react";

/**
 * Prefix client-side fetch("/api/...") and fetch("/renders/...") with basePath
 * when the app is mounted under a subpath (e.g. /ai).
 */
export function BasePathFetchPatch() {
  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
    if (!base) return;

    const original = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/") && !input.startsWith(base)) {
        return original(`${base}${input}`, init);
      }
      if (input instanceof URL && input.origin === window.location.origin) {
        if (input.pathname.startsWith("/") && !input.pathname.startsWith(base)) {
          const next = new URL(input.toString());
          next.pathname = `${base}${input.pathname}`;
          return original(next, init);
        }
      }
      if (input instanceof Request) {
        try {
          const url = new URL(input.url);
          if (
            url.origin === window.location.origin &&
            url.pathname.startsWith("/") &&
            !url.pathname.startsWith(base)
          ) {
            url.pathname = `${base}${url.pathname}`;
            return original(new Request(url.toString(), input), init);
          }
        } catch {
          // fall through
        }
      }
      return original(input, init);
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}
