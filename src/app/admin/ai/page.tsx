import { bootstrapApp } from "@/lib/bootstrap";

import { AdminShell, SectionCard } from "../components";
import { AiSettingsForm } from "./ai-settings-form";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await bootstrapApp();

  return (
    <AdminShell
      title="Настройки AI"
      description="Ключ OpenAI, модели и режимы генерации. Сохраняются в config/ai-settings.json и перекрывают .env без перезапуска."
    >
      <SectionCard
        title="Ключ, модели и режимы"
        tip="Ключ можно вставить здесь или оставить в .env — настройки имеют приоритет."
        tourId="tour-ai-settings"
      >
        <AiSettingsForm />
      </SectionCard>
    </AdminShell>
  );
}
