import { NextRequest, NextResponse } from "next/server";

import { splitProfitProgression } from "@/lib/amounts/split-profit";
import { listCompleteBetPacks } from "@/lib/bet-cycle";
import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig, resetConfigCache } from "@/lib/config/loader";
import { deleteAmountPack, upsertAmountPack } from "@/lib/config/writer";
import {
  amountPackSchema,
  amountsConfigSchema,
  selectAmountPacksForProject,
  type AmountPack,
} from "@/lib/schemas/amounts";
import { getEnv } from "@/lib/schemas/env";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

async function writeAllPacks(packs: AmountPack[], accountLastDigits: { min: number; max: number }) {
  const next = amountsConfigSchema.parse({ packs, accountLastDigits });
  const configDir = getEnv().CONFIG_DIR ?? "./config";
  await fs.writeFile(
    path.resolve(configDir, "amounts.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf-8",
  );
  resetConfigCache();
  return next;
}

/** Deterministic ±jitter so packs look natural but stay near target. */
function packProfitFinal(target: number, packNumber: number): number {
  // Cycle through mild offsets: -6% … +7%
  const offsets = [-0.06, -0.03, -0.01, 0.02, 0.04, 0.07, -0.04, 0.01, 0.05, -0.02];
  const t = offsets[(packNumber - 1) % offsets.length]!;
  return Math.max(100, Math.round(target * (1 + t)));
}

export async function GET(request: NextRequest) {
  try {
    await bootstrapApp();
    const config = await loadAppConfig();
    const projectId = request.nextUrl.searchParams.get("projectId");
    const packs = projectId
      ? selectAmountPacksForProject(
          config.amounts.packs,
          projectId,
          config.projects.projects.find((p) => p.id === projectId)?.currency ?? "MXN",
        )
      : config.amounts.packs;
    return NextResponse.json({
      ok: true,
      packs,
      accountLastDigits: config.amounts.accountLastDigits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as Record<string, unknown>;

    /**
     * From media bet packs (packNN_1/2/3) build amount rows for the project.
     * profitFinal ≈ target (realistic spread). deposit/profit1/2 auto-split.
     */
    if (body.action === "generate-from-media") {
      const projectId = String(body.projectId ?? "");
      const profitFinal = Number(body.profitFinal);
      if (!projectId || !Number.isFinite(profitFinal) || profitFinal <= 0) {
        return NextResponse.json(
          { error: "Нужны projectId и profitFinal > 0" },
          { status: 400 },
        );
      }

      const config = await loadAppConfig();
      const project = config.projects.projects.find((p) => p.id === projectId);
      if (!project) {
        return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
      }

      const mediaPacks = await listCompleteBetPacks(projectId);
      if (mediaPacks.length === 0) {
        return NextResponse.json(
          {
            error:
              "Нет полных паков ставок в медиа (нужны pack01_1/2/3 …). Загрузите скрины во вкладке Ставки/Медиа.",
          },
          { status: 400 },
        );
      }

      const generated: AmountPack[] = mediaPacks.map((mp) => {
        const final = packProfitFinal(profitFinal, mp.packNumber);
        const split = splitProfitProgression({ profitFinal: final });
        // Mild deposit wobble per pack
        const depJitter = 1 + ((mp.packNumber * 3) % 5) * 0.02 - 0.04;
        return amountPackSchema.parse({
          id: `${projectId}_${String(mp.packNumber).padStart(2, "0")}`,
          projectId,
          betPack: mp.packNumber,
          deposit: Math.max(1, Math.round(split.deposit * depJitter)),
          profit1: split.profit1,
          profit2: split.profit2,
          profitFinal: final,
          currency: project.currency,
        });
      });

      // Replace this project's packs; keep other projects intact.
      const others = config.amounts.packs.filter((p) => p.projectId !== projectId);
      const next = await writeAllPacks(
        [...others, ...generated],
        config.amounts.accountLastDigits,
      );

      return NextResponse.json({
        ok: true,
        generated: generated.length,
        mediaPacks: mediaPacks.length,
        targetProfitFinal: profitFinal,
        packs: selectAmountPacksForProject(next.packs, projectId, project.currency),
        message: `Собрано ${generated.length} паков из медиа под итог ~${profitFinal.toLocaleString()} ${project.currency}`,
      });
    }

    const parsed = amountPackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    const amounts = await upsertAmountPack(parsed.data);
    return NextResponse.json({ ok: true, pack: parsed.data, packs: amounts.packs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await bootstrapApp();
    const id =
      request.nextUrl.searchParams.get("id") ??
      ((await request.json().catch(() => ({}))) as { id?: string }).id;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const amounts = await deleteAmountPack(id);
    return NextResponse.json({ ok: true, packs: amounts.packs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
