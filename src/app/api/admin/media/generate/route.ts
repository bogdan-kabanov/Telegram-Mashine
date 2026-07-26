import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { isOpenAIConfigured } from "@/lib/openai/client";
import { generateClientPhoto, isAiClientPhotoEnabled } from "@/lib/openai/images";
import {
  generateSceneMedia,
  isAiMediaEnabled,
  type SceneMediaKind,
} from "@/lib/openai/scene-media";

const SCENE_KINDS = new Set<SceneMediaKind>(["bet", "conditions", "sticker", "avatar", "wallpaper"]);

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();

    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        { error: "Нужен OPENAI_API_KEY в .env — без ключа генерация недоступна." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      count?: number;
      clientName?: string;
      hint?: string;
      projectId?: string;
    };

    const kind = (body.kind ?? "story_photo").trim();
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 5);

    if (kind === "story_photo") {
      const results: Array<{ id: string; path: string; filename: string; url: string; type: string }> = [];
      const defaultHint =
        body.hint?.trim() ||
        "Mi padre está enfermo en el hospital, necesita una operación y medicamentos caros";
      let locale: string | undefined;
      if (body.projectId) {
        try {
          const p = await getProjectById(body.projectId);
          locale = p.locale;
        } catch {
          // optional
        }
      }
      for (let i = 0; i < count; i++) {
        const generated = await generateClientPhoto({
          ...(body.projectId ? { projectId: body.projectId } : {}),
          ...(body.clientName ? { clientName: body.clientName } : {}),
          hint: defaultHint,
          ...(locale ? { locale } : {}),
          saveToPool: true,
        });
        if (!generated) {
          return NextResponse.json(
            {
              error:
                results.length > 0
                  ? `Сгенерировано ${results.length} из ${count}, дальше ошибка OpenAI Images.`
                  : "Не удалось сгенерировать фото. Проверьте ключ и модель OPENAI_IMAGE_MODEL.",
              assets: results,
              aiEnabled: isAiClientPhotoEnabled(),
            },
            { status: results.length > 0 ? 207 : 502 },
          );
        }
        results.push({
          id: generated.assetId,
          path: generated.path,
          filename: generated.filename,
          url: `/api/admin/media/file?id=${generated.assetId}`,
          type: "story_photo",
        });
      }
      return NextResponse.json({
        ok: true,
        count: results.length,
        assets: results,
        message:
          results.length === 1
            ? "Фото клиента сгенерировано и добавлено в общий пул."
            : `Сгенерировано ${results.length} фото клиента — в общем пуле.`,
      });
    }

    if (kind === "video_note") {
      return NextResponse.json(
        { error: "Кружки (MP4) ИИ пока не генерирует — загрузите готовый файл." },
        { status: 400 },
      );
    }

    if (!SCENE_KINDS.has(kind as SceneMediaKind)) {
      return NextResponse.json({ error: `Неизвестный тип генерации: ${kind}` }, { status: 400 });
    }

    const sceneKind = kind as SceneMediaKind;
    const needsProject = sceneKind === "bet" || sceneKind === "conditions" || sceneKind === "avatar" || sceneKind === "wallpaper";
    if (needsProject && !body.projectId) {
      return NextResponse.json({ error: "Выберите проект для этого типа медиа." }, { status: 400 });
    }

    let projectMeta: { name?: string; locale?: string; currency?: string } = {};
    if (body.projectId) {
      try {
        const p = await getProjectById(body.projectId);
        projectMeta = { name: p.name, locale: p.locale, currency: p.currency };
      } catch {
        return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
      }
    }

    const results: Array<{ id: string; path: string; filename: string; url: string; type: string }> = [];
    const genCount = sceneKind === "wallpaper" || sceneKind === "conditions" || sceneKind === "avatar" ? 1 : count;

    for (let i = 0; i < genCount; i++) {
      try {
        const generated = await generateSceneMedia({
          kind: sceneKind,
          force: true,
          ...(body.projectId ? { projectId: body.projectId } : {}),
          ...(projectMeta.name ? { projectName: projectMeta.name } : {}),
          ...(projectMeta.locale ? { locale: projectMeta.locale } : {}),
          ...(projectMeta.currency ? { currency: projectMeta.currency } : {}),
          ...(body.clientName ? { clientName: body.clientName } : {}),
        });
        if (!generated) {
          return NextResponse.json(
            {
              error: "Не удалось сгенерировать изображение.",
              assets: results,
              aiEnabled: isAiMediaEnabled(),
            },
            { status: 502 },
          );
        }
        results.push({
          id: generated.assetId,
          path: generated.path,
          filename: generated.filename,
          url: `/api/admin/media/file?id=${generated.assetId}`,
          type: sceneKind,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ошибка OpenAI Images";
        return NextResponse.json(
          {
            error:
              results.length > 0
                ? `Сгенерировано ${results.length} из ${genCount}. Дальше: ${message}`
                : message,
            assets: results,
            aiEnabled: isAiMediaEnabled(),
          },
          { status: results.length > 0 ? 207 : 502 },
        );
      }
    }

    const labels: Record<string, string> = {
      bet: "Ставка",
      conditions: "Условия",
      sticker: "Стикер",
      avatar: "Аватар",
      wallpaper: "Обои",
    };

    return NextResponse.json({
      ok: true,
      count: results.length,
      assets: results,
      path: results[0]?.path,
      message:
        results.length === 1
          ? `${labels[sceneKind] ?? sceneKind}: сгенерировано через ИИ.`
          : `Сгенерировано ${results.length} × ${labels[sceneKind] ?? sceneKind}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
