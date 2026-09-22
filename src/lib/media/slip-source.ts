import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

/** Sidecar next to a generated captura/receipt PNG — remembers pristine template filename. */
export type SlipSourceMeta = {
  template: string;
  projectId: string;
  role: "client" | "manager";
};

export function slipSourceMetaPath(outputPath: string): string {
  return outputPath.replace(/\.[^.]+$/i, "") + ".source.json";
}

export function writeSlipSourceMeta(outputPath: string, meta: SlipSourceMeta): void {
  writeFileSync(slipSourceMetaPath(outputPath), JSON.stringify(meta, null, 2), "utf8");
}

export function readSlipSourceMeta(outputPath: string): SlipSourceMeta | null {
  const metaPath = slipSourceMetaPath(outputPath);
  if (!existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8")) as Partial<SlipSourceMeta>;
    if (!raw.template || !raw.projectId || (raw.role !== "client" && raw.role !== "manager")) {
      return null;
    }
    return { template: raw.template, projectId: raw.projectId, role: raw.role };
  } catch {
    return null;
  }
}

/** Refuse any write that would overwrite a pristine pool template. */
export function assertNotReceiptTemplatePath(targetPath: string): void {
  const norm = targetPath.replace(/\\/g, "/").toLowerCase();
  if (norm.includes("/receipt_templates/")) {
    throw new Error(
      `Refusing to write into receipt_templates (pristine originals are read-only): ${targetPath}`,
    );
  }
}

/**
 * Resolve which pristine template filename to use for the next regen.
 * Never returns a path under media/capturas or media/receipts — only a filename.
 */
export function resolveTemplateFilenameForRegen(params: {
  explicit?: string | null | undefined;
  mediaPath?: string | null | undefined;
}): string | undefined {
  const explicit = params.explicit?.trim();
  if (explicit) return path.basename(explicit);

  const raw = (params.mediaPath ?? "").trim().replace(/\\/g, "/");
  if (!raw) return undefined;

  if (raw.includes("/receipt_templates/")) {
    return path.basename(raw);
  }

  const abs = path.isAbsolute(raw) ? raw : path.resolve(raw);
  const meta = readSlipSourceMeta(abs);
  if (meta?.template) return meta.template;

  // Also try cwd-relative data path
  const fromCwd = path.resolve(raw);
  if (fromCwd !== abs) {
    const meta2 = readSlipSourceMeta(fromCwd);
    if (meta2?.template) return meta2.template;
  }

  return undefined;
}
