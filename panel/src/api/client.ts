const BASE = (import.meta.env.BASE_URL || "/panel/").replace(/\/$/, "") || "";

/** Prefix API paths when Next is mounted under a basePath. Panel itself uses /panel. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  const { json, ...rest } = init ?? {};
  const opts: RequestInit = { ...rest, headers };
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    opts.body = JSON.stringify(json);
  }
  const res = await fetch(apiUrl(path), opts);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : res.statusText || "Request failed";
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export function mediaFileUrl(path: string): string {
  return apiUrl(`/api/admin/media/file?path=${encodeURIComponent(path)}`);
}

export { BASE as PANEL_BASE };
