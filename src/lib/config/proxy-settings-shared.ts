import { z } from "zod";

/** Empty string = no proxy. http(s)://[user:pass@]host:port */
export const proxyUrlSchema = z
  .string()
  .trim()
  .default("")
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Прокси: нужен URL вида http://user:pass@host:port (только http/https)" },
  );

export const proxySettingsSchema = z.object({
  PROXY_URL: proxyUrlSchema,
});

export type ProxySettings = z.infer<typeof proxySettingsSchema>;

export type ProxySettingsPublic = {
  configured: boolean;
  source: "settings" | "env" | "none";
  /** Masked URL for display (password replaced). */
  hint: string | null;
};

export function maskProxyUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.password) url.password = "••••";
    return url.toString();
  } catch {
    if (trimmed.length <= 12) return "••••••••";
    return `${trimmed.slice(0, 8)}…`;
  }
}
