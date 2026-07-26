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
      title="Конструктор"
      description="Одна вкладка: настройка проекта по шагам из ТЗ — от фона и условий до пробного отзыва и запуска."
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
          theme: {
            incomingBubble: p.theme.incomingBubble,
            outgoingBubble: p.theme.outgoingBubble,
            accentColor: p.theme.accentColor,
          },
          depositMessageTemplate: p.depositMessageTemplate,
          completionMessageTemplate: p.completionMessageTemplate,
          payoutMessageTemplate: p.payoutMessageTemplate,
        }))}
        initialStatus={state.status}
      />
    </AdminShell>
  );
}
