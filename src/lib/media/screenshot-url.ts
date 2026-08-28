import { withBasePath } from "@/lib/base-path";

/** Convert stored screenshot path to a URL the admin/browser can load. */
export function toPublicScreenshotUrl(storedPath: string): string {
  const normalized = storedPath.replace(/\\/g, "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  if (normalized.includes("/public/")) {
    const after = normalized.split("/public")[1] ?? normalized;
    const name = after.split("/").pop() ?? after;
    return withBasePath(`/renders/${name}`);
  }
  if (normalized.startsWith("public/")) {
    const name = normalized.split("/").pop() ?? normalized;
    return withBasePath(`/renders/${name}`);
  }
  if (normalized.startsWith("/renders/") || normalized.startsWith("/api/renders/")) {
    return withBasePath(normalized);
  }
  const fileName = normalized.split("/").pop() ?? normalized;
  return withBasePath(`/renders/${fileName}`);
}
