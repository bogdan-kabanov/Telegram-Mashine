import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { withBasePath } from "@/lib/base-path";
import { getProjectById, loadAppConfig } from "@/lib/config/loader";
import { stampExistingBet, stampProjectBetPack, stampProjectBetSlot } from "@/lib/media/stamp-bets";
import { isOpenAIConfigured } from "@/lib/openai/client";
import { generateClientPhoto, isAiClientPhotoEnabled } from "@/lib/openai/images";
import {
  generateSceneMedia,
  isAiMediaEnabled,
  type SceneMediaKind,
} from "@/lib/openai/scene-media";
import { betDepositForSlot, betProfitForSlot } from "@/lib/amounts/split-profit";
import { resolveBetPackNumber } from "@/lib/schemas/amounts";

const SCENE_KINDS = new Set<SceneMediaKind>(["conditions", "sticker", "avatar", "wallpaper"]);

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function mediaFileUrl(relPath: string): string {
  return withBasePath(`/api/admin/media/file?path=${encodeURIComponent(relPath)}`);
}

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();

    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      count?: number;
      clientName?: string;
      hint?: string;
      projectId?: string;
      amountHint?: string;
      amountPackId?: string;
      deposit?: number;
      profit?: number;
      profit1?: number;
      profit2?: number;
      profit3?: number;
      profitFinal?: number;
      randomPack?: boolean;
      sourcePath?: string;
      slot?: string;
    };

    const kind = (body.kind ?? "story_photo").trim();
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 5);

    if (kind === "bet") {
      if (!body.projectId) {
        return NextResponse.json({ error: "Выберите проект для ставок." }, { status: 400 });
      }
      const project = await getProjectById(body.projectId);
      const config = await loadAppConfig();
      const pack = body.amountPackId
        ? config.amounts.packs.find((p) => p.id === body.amountPackId)
        : config.amounts.packs.find((p) => p.projectId === project.id);
      const deposit = Number(body.deposit) > 0 ? Number(body.deposit) : pack?.deposit;
      const profit1 = Number(body.profit1) > 0 ? Number(body.profit1) : pack?.profit1;
      const profit2 = Number(body.profit2) > 0 ? Number(body.profit2) : pack?.profit2;
      const profitFinal = Number(body.profitFinal) > 0 ? Number(body.profitFinal) : pack?.profitFinal;
      const profit3Explicit = Number(body.profit3) > 0 ? Number(body.profit3) : undefined;
      const profit3 =
        profit3Explicit ??
        (profit1 != null && profit2 != null && profitFinal != null
          ? betProfitForSlot(
              {
                profit1,
                profit2,
                profit3: 0,
                profitFinal,
              },
              3,
            )
          : undefined);
      const currency = pack?.currency ?? project.currency;
      const packNumber = pack && !body.randomPack ? resolveBetPackNumber(pack) : null;
      const useRandomPack = body.randomPack === true || (!packNumber && !body.amountPackId);
      const slot = (body.slot ?? "").trim();
      const slotNum = slot === "bet2" ? 2 : slot === "bet3" ? 3 : 1;

      if (!deposit || !profit1 || !profit2 || !profitFinal) {
        return NextResponse.json(
          { error: "Нет сумм для ставки — выберите пак сумм в конструкторе." },
          { status: 400 },
        );
      }

      const slotDeposit = betDepositForSlot(
        { deposit, profit1, profit2 },
        slotNum,
      );
      const singleProfit =
        Number(body.profit) > 0
          ? Number(body.profit)
          : slot === "bet2"
            ? profit2
            : slot === "bet3"
              ? profit3
              : profit1;

      try {
        if (count === 1 && (body.sourcePath?.trim() || slot.startsWith("bet"))) {
          const source = body.sourcePath?.trim();
          if (!source && count === 1) {
            const one = await stampProjectBetSlot({
              projectId: project.id,
              slot: slotNum,
              deposit: slotDeposit,
              profit: singleProfit ?? profit1,
              currency,
              ...(packNumber ? { packNumber } : {}),
              ...(useRandomPack ? { randomPack: true } : {}),
              ...(body.clientName?.trim() ? { name: body.clientName.trim() } : {}),
            });
            return NextResponse.json({
              ok: true,
              count: 1,
              assets: [
                {
                  id: `disk:${one.path}`,
                  path: one.path,
                  filename: one.filename,
                  url: mediaFileUrl(one.path),
                  type: "bet",
                },
              ],
              path: one.path,
              message: "Суммы проставлены на исходном скрине ставки. Новую фотку не рисуем.",
            });
          }
          const stamped = await stampExistingBet({
            sourcePath: source!,
            projectId: project.id,
            deposit: slotDeposit,
            profit: singleProfit ?? profit1,
            currency,
            ...(body.clientName?.trim() ? { name: body.clientName.trim() } : {}),
          });
          return NextResponse.json({
            ok: true,
            count: 1,
            assets: [
              {
                id: `disk:${stamped.path}`,
                path: stamped.path,
                filename: stamped.filename,
                url: mediaFileUrl(stamped.path),
                type: "bet",
              },
            ],
            path: stamped.path,
            message: "Суммы проставлены на исходном скрине ставки. Новую фотку не рисуем.",
          });
        }

        const stamped = await stampProjectBetPack({
          projectId: project.id,
          deposit,
          profit1,
          profit2,
          profit3: profit3 ?? profitFinal - profit1 - profit2,
          currency,
          ...(packNumber ? { packNumber } : {}),
          ...(useRandomPack ? { randomPack: true } : {}),
          ...(body.clientName?.trim() ? { name: body.clientName.trim() } : {}),
        });
        const assets = stamped.map((s) => ({
          id: `disk:${s.path}`,
          path: s.path,
          filename: s.filename,
          url: mediaFileUrl(s.path),
          type: "bet",
        }));
        return NextResponse.json({
          ok: true,
          count: assets.length,
          assets,
          path: assets[0]?.path,
          message: "Суммы проставлены на трёх исходных скринах ставок. Новую фотку не рисуем.",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Не удалось проставить суммы на ставке";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        { error: "Нужен OPENAI_API_KEY в .env — без ключа генерация недоступна." },
        { status: 400 },
      );
    }

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
          url: withBasePath(`/api/admin/media/file?id=${generated.assetId}`),
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
    const needsProject = sceneKind === "conditions" || sceneKind === "avatar" || sceneKind === "wallpaper";
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
          ...(body.amountHint?.trim() ? { amountHint: body.amountHint.trim() } : {}),
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
          url: withBasePath(`/api/admin/media/file?id=${generated.assetId}`),
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
