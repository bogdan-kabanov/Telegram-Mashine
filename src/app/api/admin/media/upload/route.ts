import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { MEDIA_TYPE_DIRS, UPLOAD_MEDIA_TYPES, type UploadMediaType } from "@/lib/media/types";

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();

    const formData = await request.formData();
    const file = formData.get("file");
    const type = String(formData.get("type") ?? "") as UploadMediaType;
    const projectId = String(formData.get("projectId") ?? "") || null;
    const legendId = String(formData.get("legendId") ?? "") || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
    }

    if (!UPLOAD_MEDIA_TYPES.includes(type)) {
      return NextResponse.json({ error: "Неверный тип медиа" }, { status: 400 });
    }

    if (type === "story_photo" && !legendId) {
      return NextResponse.json({ error: "Для фото в диалоге выберите легенду" }, { status: 400 });
    }

    if (type === "wallpaper" && !projectId) {
      return NextResponse.json({ error: "Для обоев выберите проект" }, { status: 400 });
    }

    const dataDir = process.env.DATA_DIR ?? "./data";
    let destDir: string;
    let relativePath: string;
    let savedFilename: string;

    if (type === "wallpaper" && projectId) {
      destDir = path.resolve(dataDir, MEDIA_TYPE_DIRS.wallpaper);
      savedFilename = `${projectId}${path.extname(file.name) || ".jpg"}`;
      relativePath = path.join("data", MEDIA_TYPE_DIRS.wallpaper, savedFilename).replace(/\\/g, "/");
    } else if (type === "story_photo" && legendId) {
      destDir = path.resolve(dataDir, MEDIA_TYPE_DIRS.story_photo, legendId);
      savedFilename = `${Date.now()}_${file.name.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_")}`;
      relativePath = path
        .join("data", MEDIA_TYPE_DIRS.story_photo, legendId, savedFilename)
        .replace(/\\/g, "/");
    } else {
      const base = MEDIA_TYPE_DIRS[type as keyof typeof MEDIA_TYPE_DIRS] ?? `media/${type}`;
      const subdir = projectId && type !== "sticker" ? `${base}/${projectId}` : base;
      destDir = path.resolve(dataDir, subdir);
      savedFilename = `${Date.now()}_${file.name.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_")}`;
      relativePath = path.join("data", subdir, savedFilename).replace(/\\/g, "/");
    }

    mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, savedFilename);
    writeFileSync(destPath, Buffer.from(await file.arrayBuffer()));

    const id = randomUUID();
    const db = getDb();
    await db.insert(mediaAssets).values({
      id,
      projectId,
      type,
      filename: savedFilename,
      path: relativePath,
      mimeType: file.type || null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      id,
      filename: savedFilename,
      path: relativePath,
      type,
      projectId,
      legendId,
      url: `/api/admin/media/file?id=${id}`,
      message:
        type === "story_photo"
          ? `Фото привязано к легенде «${legendId}». При генерации попадёт в диалог.`
          : type === "wallpaper"
            ? `Обои для проекта ${projectId} установлены.`
            : "Файл загружен",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
