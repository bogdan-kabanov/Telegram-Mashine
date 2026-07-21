import { existsSync, readdirSync, unlinkSync } from "fs";
import path from "path";

import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { MEDIA_TYPE_DIRS, MEDIA_TYPE_LABELS } from "@/lib/media/types";

function resolveMediaPath(stored: string): string {
  if (path.isAbsolute(stored) && existsSync(stored)) return stored;
  const fromCwd = path.resolve(stored);
  if (existsSync(fromCwd)) return fromCwd;
  const dataDir = process.env.DATA_DIR ?? "./data";
  const stripped = stored.replace(/^data[\\/]/, "");
  return path.resolve(dataDir, stripped);
}

function extractLegendId(filePath: string): string | null {
  const m = filePath.replace(/\\/g, "/").match(/story_photos\/([^/]+)\//);
  return m?.[1] ?? null;
}

export async function GET() {
  try {
    await bootstrapApp();
    const db = getDb();
    const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(200);

    const fromDb = rows
      .map((a) => {
        const abs = resolveMediaPath(a.path);
        if (!existsSync(abs)) return null;
        return {
          id: a.id,
          type: a.type,
          label: MEDIA_TYPE_LABELS[a.type] ?? a.type,
          filename: a.filename,
          path: a.path,
          projectId: a.projectId,
          legendId: extractLegendId(a.path),
          mimeType: a.mimeType,
          createdAt: a.createdAt,
          url: `/api/admin/media/file?id=${a.id}`,
          isImage: /\.(jpg|jpeg|png|webp|gif)$/i.test(a.filename) || (a.mimeType?.startsWith("image/") ?? false),
          isVideo: /\.(mp4|mov)$/i.test(a.filename) || (a.mimeType?.startsWith("video/") ?? false),
        };
      })
      .filter(Boolean);

    // Also surface disk-only story photos / stickers not yet in DB
    const dataDir = process.env.DATA_DIR ?? "./data";
    const diskExtras: typeof fromDb = [];
    const knownPaths = new Set(fromDb.map((a) => a!.path.replace(/\\/g, "/")));

    for (const [type, rel] of Object.entries(MEDIA_TYPE_DIRS)) {
      const root = path.resolve(dataDir, rel);
      if (!existsSync(root)) continue;

      const walk = (dir: string, legendId: string | null = null) => {
        for (const name of readdirSync(dir, { withFileTypes: true })) {
          if (name.name.startsWith(".") || name.name === ".gitkeep") continue;
          const full = path.join(dir, name.name);
          if (name.isDirectory()) {
            if (type === "story_photo") walk(full, name.name);
            else walk(full, legendId);
            continue;
          }
          if (!/\.(jpg|jpeg|png|webp|gif|mp4|mov)$/i.test(name.name)) continue;
          const relPath = path.join("data", path.relative(path.resolve(dataDir), full)).replace(/\\/g, "/");
          if (knownPaths.has(relPath)) continue;
          const id = `disk:${Buffer.from(relPath).toString("base64url")}`;
          diskExtras.push({
            id,
            type,
            label: MEDIA_TYPE_LABELS[type] ?? type,
            filename: name.name,
            path: relPath,
            projectId: null,
            legendId: type === "story_photo" ? legendId : extractLegendId(relPath),
            mimeType: null,
            createdAt: "",
            url: `/api/admin/media/file?path=${encodeURIComponent(relPath)}`,
            isImage: /\.(jpg|jpeg|png|webp|gif)$/i.test(name.name),
            isVideo: /\.(mp4|mov)$/i.test(name.name),
          });
        }
      };
      walk(root);
    }

    return NextResponse.json({
      ok: true,
      assets: [...fromDb, ...diskExtras],
      labels: MEDIA_TYPE_LABELS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await bootstrapApp();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = getDb();

    if (id.startsWith("disk:")) {
      const rel = Buffer.from(id.slice(5), "base64url").toString("utf-8");
      const abs = resolveMediaPath(rel);
      if (existsSync(abs)) unlinkSync(abs);
      return NextResponse.json({ ok: true });
    }

    const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const abs = resolveMediaPath(row.path);
    if (existsSync(abs)) unlinkSync(abs);
    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
