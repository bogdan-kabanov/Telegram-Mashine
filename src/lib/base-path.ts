/** App mount path (e.g. `/ai`). Empty string = site root. Baked at build via NEXT_PUBLIC_BASE_PATH. */
export function getBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? "";
  if (!raw || raw === "/") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** Prefix an absolute app path with basePath. Idempotent. */
export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path;
  const base = getBasePath();
  if (!base) return path;
  if (path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
}
