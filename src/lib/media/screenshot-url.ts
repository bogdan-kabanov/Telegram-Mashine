import { withBasePath } from "@/lib/base-path";

/** Convert stored screenshot path to a URL the admin/browser can load. */
export function toPublicScreenshotUrl(
  storedPath: string,
  cacheBust?: string | number | null,
): string {
  const normalized = storedPath.replace(/\\/g, "/");
  let url: string;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    url = normalized;
  } else if (normalized.includes("/public/")) {
    const after = normalized.split("/public")[1] ?? normalized;
    const name = after.split("/").pop() ?? after;
    url = withBasePath(`/renders/${name}`);
  } else if (normalized.startsWith("public/")) {
    const name = normalized.split("/").pop() ?? normalized;
    url = withBasePath(`/renders/${name}`);
  } else if (normalized.startsWith("/renders/") || normalized.startsWith("/api/renders/")) {
    url = withBasePath(normalized);
  } else {
    const fileName = normalized.split("/").pop() ?? normalized;
    url = withBasePath(`/renders/${fileName}`);
  }

  if (cacheBust == null || cacheBust === "") return url;
  // Same reviewId_screen_N.png is overwritten on rerender — bust browser cache.
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(String(cacheBust))}`;
}
