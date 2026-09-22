import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getRuntimeManager } from "@/lib/runtime/manager";

import { AdminShell } from "../components";
import { ProjectConstructor } from "./project-constructor";

export const dynamic = "force-dynamic";

export default async function ConstructorPage() {
  await bootstrapApp();
  const [config, state] = await Promise.all([loadAppConfig(), getRuntimeManager().getState()]);

  return (
    <AdminShell
      wide
      title="Конструктор"
      description="Слева все шаги сразу. Справа — живой отзыв 1:1 (тот же рендер, что после генерации), с первой секунды."
    >
      <ProjectConstructor
        projects={config.projects.projects.map((p) => ({
          id: p.id,
          name: p.name,
          locale: p.locale,
          currency: p.currency,
          managerHandle: p.managerHandle,
          managerName: p.managerName,
          twoPhaseReview: p.twoPhaseReview,
          phaseDelayMinutes: p.phaseDelayMinutes ?? 90,
          wallpaperPath: p.wallpaperPath ?? null,
          conditionsImagePath: p.conditionsImagePath ?? null,
          conditionsTexts: p.conditionsTexts ?? [],
          managerAvatarPath: p.managerAvatarPath ?? null,
          clientAvatarPath: p.clientAvatarPath ?? null,
          ...(p.receiptTemplates
            ? {
                receiptTemplates: {
                  client: [...p.receiptTemplates.client],
                  manager: [...p.receiptTemplates.manager],
                },
              }
            : {}),
          theme: {
            incomingBubble: p.theme.incomingBubble,
            outgoingBubble: p.theme.outgoingBubble,
            accentColor: p.theme.accentColor,
          },
          depositMessageTemplate: p.depositMessageTemplate,
          completionMessageTemplate: p.completionMessageTemplate,
          payoutMessageTemplate: p.payoutMessageTemplate,
        }))}
        amountPacks={config.amounts.packs.map((p) => ({
          id: p.id,
          projectId: p.projectId,
          betPack: p.betPack,
          deposit: p.deposit,
          profit1: p.profit1,
          profit2: p.profit2,
          profitFinal: p.profitFinal,
          currency: p.currency,
        }))}
        initialStatus={state.status}
      />
    </AdminShell>
  );
}
