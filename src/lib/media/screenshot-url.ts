/** Convert stored screenshot path to a URL the admin/browser can load. */
export function toPublicScreenshotUrl(storedPath: string): string {
  const normalized = storedPath.replace(/\\/g, "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  if (normalized.includes("/public/")) {
    const after = normalized.split("/public")[1] ?? normalized;
    const name = after.split("/").pop() ?? after;
    return `/renders/${name}`;
  }
  if (normalized.startsWith("public/")) {
    const name = normalized.split("/").pop() ?? normalized;
    return `/renders/${name}`;
  }
  if (normalized.startsWith("/renders/")) return normalized;
  if (normalized.startsWith("/api/renders/")) return normalized;
  const fileName = normalized.split("/").pop() ?? normalized;
  return `/renders/${fileName}`;
}
