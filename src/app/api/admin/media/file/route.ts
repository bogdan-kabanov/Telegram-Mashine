import { existsSync, readFileSync } from "fs";
import path from "path";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

function resolveMediaPath(stored: string): string {
  if (path.isAbsolute(stored) && existsSync(stored)) return stored;
  const fromCwd = path.resolve(stored);
  if (existsSync(fromCwd)) return fromCwd;
  const dataDir = process.env.DATA_DIR ?? "./data";
  return path.resolve(dataDir, stored.replace(/^data[\\/]/, ""));
}

function mimeFromName(name: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    await bootstrapApp();
    const id = request.nextUrl.searchParams.get("id");
    const pathParam = request.nextUrl.searchParams.get("path");

    let abs = "";
    let filename = "file";
    let mime: string | null = null;

    if (id?.startsWith("disk:")) {
      const rel = Buffer.from(id.slice(5), "base64url").toString("utf-8");
      abs = resolveMediaPath(rel);
      filename = path.basename(rel);
    } else if (id) {
      const db = getDb();
      const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
      const row = rows[0];
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      abs = resolveMediaPath(row.path);
      filename = row.filename;
      mime = row.mimeType;
    } else if (pathParam) {
      const decoded = decodeURIComponent(pathParam);
      if (decoded.includes("..")) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
      }
      abs = resolveMediaPath(decoded);
      filename = path.basename(decoded);
    } else {
      return NextResponse.json({ error: "id or path required" }, { status: 400 });
    }

    if (!existsSync(abs)) {
      return NextResponse.json({ error: "File missing" }, { status: 404 });
    }

    const buf = readFileSync(abs);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": mimeFromName(filename, mime),
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
