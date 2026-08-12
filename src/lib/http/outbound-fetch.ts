import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { getProxyUrl } from "@/lib/config/proxy-settings";

type FetchFn = typeof fetch;

let cachedProxyUrl: string | null = null;
let cachedAgent: ProxyAgent | null = null;
let cachedFetch: FetchFn | null = null;

function getProxyAgent(proxyUrl: string): ProxyAgent {
  if (cachedAgent && cachedProxyUrl === proxyUrl) return cachedAgent;
  cachedAgent?.close().catch(() => undefined);
  cachedProxyUrl = proxyUrl;
  cachedAgent = new ProxyAgent(proxyUrl);
  return cachedAgent;
}

/**
 * Fetch for Telegram / OpenAI / CDN downloads.
 * Uses admin proxy (or HTTPS_PROXY env) when set; otherwise global fetch.
 */
export function getOutboundFetch(): FetchFn {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    cachedFetch = null;
    return globalThis.fetch.bind(globalThis);
  }

  if (cachedFetch && cachedProxyUrl === proxyUrl) return cachedFetch;

  const agent = getProxyAgent(proxyUrl);
  const proxied = ((input: RequestInfo | URL, init?: RequestInit) => {
    const merged = {
      ...(init as UndiciRequestInit | undefined),
      dispatcher: agent,
    } satisfies UndiciRequestInit;

    // Preserve Request method/headers/body when SDK passes a Request object.
    return undiciFetch(input as Parameters<typeof undiciFetch>[0], merged) as unknown as Promise<Response>;
  }) as FetchFn;

  cachedFetch = proxied;
  return proxied;
}

/** Call after proxy settings change so clients pick up the new URL. */
export function resetOutboundFetchCache(): void {
  cachedFetch = null;
  cachedProxyUrl = null;
  const agent = cachedAgent;
  cachedAgent = null;
  if (agent) void agent.close().catch(() => undefined);
}
