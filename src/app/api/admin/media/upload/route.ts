import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { updateProject } from "@/lib/config/writer";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { MEDIA_TYPE_DIRS, UPLOAD_MEDIA_TYPES, type UploadMediaType } from "@/lib/media/types";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov"]);

function allowedExtsForType(type: UploadMediaType): Set<string> {
  if (type === "video_note") return VIDEO_EXTS;
  // Conditions explicitly support animated GIF (ТЗ: картинка / GIF).
  if (type === "conditions") return IMAGE_EXTS;
  return new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
}

function safeUploadFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^\w.\-а-яА-ЯёЁ]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${Date.now()}_${base || "file"}${ext}`;
}

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

    const ext = path.extname(file.name).toLowerCase();
    const allowed = allowedExtsForType(type);
    if (!allowed.has(ext)) {
      const list = [...allowed].join(", ");
      return NextResponse.json(
        {
          error:
            type === "conditions"
              ? `Для условий нужен JPG, PNG, WEBP или GIF. Сейчас: ${ext || "без расширения"}`
              : `Неподдерживаемый формат ${ext || "(нет расширения)"}. Разрешено: ${list}`,
        },
        { status: 400 },
      );
    }

    // Project-scoped media (bets, conditions, circles, avatars) — always pick a project.
    const PROJECT_SCOPED: UploadMediaType[] = ["wallpaper", "bet", "conditions", "video_note", "avatar"];
    if (PROJECT_SCOPED.includes(type) && !projectId) {
      return NextResponse.json({ error: "Выберите проект — медиа не смешиваем между менеджерами" }, { status: 400 });
    }

    const dataDir = process.env.DATA_DIR ?? "./data";
    let destDir: string;
    let relativePath: string;
    let savedFilename: string;

    if (type === "wallpaper" && projectId) {
      destDir = path.resolve(dataDir, MEDIA_TYPE_DIRS.wallpaper);
      savedFilename = `${projectId}${ext || ".jpg"}`;
      relativePath = path.join("data", MEDIA_TYPE_DIRS.wallpaper, savedFilename).replace(/\\/g, "/");
    } else if (type === "story_photo") {
      // Shared pool — each photo is used at most once across all reviews
      const folder = legendId ? legendId : "pool";
      destDir = path.resolve(dataDir, MEDIA_TYPE_DIRS.story_photo, folder);
      savedFilename = safeUploadFilename(file.name);
      relativePath = path
        .join("data", MEDIA_TYPE_DIRS.story_photo, folder, savedFilename)
        .replace(/\\/g, "/");
    } else if (type === "video_note" && projectId) {
      // Tag circle with a legend (or "standalone" for weekly thanks without hardship story).
      const folder = legendId?.trim() || "standalone";
      const subdir = path.join(MEDIA_TYPE_DIRS.video_note, projectId, folder);
      destDir = path.resolve(dataDir, subdir);
      savedFilename = safeUploadFilename(file.name);
      relativePath = path.join("data", subdir, savedFilename).replace(/\\/g, "/");
    } else if (type === "sticker") {
      const base = MEDIA_TYPE_DIRS.sticker;
      destDir = path.resolve(dataDir, base);
      savedFilename = safeUploadFilename(file.name);
      relativePath = path.join("data", base, savedFilename).replace(/\\/g, "/");
    } else {
      const base = MEDIA_TYPE_DIRS[type as keyof typeof MEDIA_TYPE_DIRS] ?? `media/${type}`;
      const subdir = projectId ? `${base}/${projectId}` : base;
      destDir = path.resolve(dataDir, subdir);
      savedFilename = safeUploadFilename(file.name);
      relativePath = path.join("data", subdir, savedFilename).replace(/\\/g, "/");
    }

    mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, savedFilename);
    writeFileSync(destPath, Buffer.from(await file.arrayBuffer()));

    const id = randomUUID();
    const db = getDb();
    const mimeFallback =
      ext === ".gif"
        ? "image/gif"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".mp4"
              ? "video/mp4"
              : ext === ".mov"
                ? "video/quicktime"
                : "image/jpeg";
    await db.insert(mediaAssets).values({
      id,
      projectId,
      type,
      filename: savedFilename,
      path: relativePath,
      mimeType: file.type || mimeFallback,
      createdAt: new Date().toISOString(),
    });

    if (projectId && type === "wallpaper") {
      await updateProject(projectId, { wallpaperPath: relativePath });
    }
    if (projectId && type === "conditions") {
      await updateProject(projectId, { conditionsImagePath: relativePath });
    }
    if (projectId && type === "avatar") {
      await updateProject(projectId, { clientAvatarPath: relativePath });
    }

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
          ? "Фото клиента добавлено в общий пул. Каждое фото используется только один раз."
          : type === "wallpaper"
            ? `Обои для проекта ${projectId} установлены.`
            : type === "conditions"
              ? `Условия для проекта ${projectId} сохранены${ext === ".gif" ? " (GIF)" : ""}.`
              : type === "video_note"
                ? legendId && legendId !== "standalone"
                  ? `Кружок привязан к истории «${legendId}» — текст отзыва и кружок будут из одной легенды.`
                  : "Кружок сохранён как standalone (недельные / без привязки к истории)."
                : "Файл загружен",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
