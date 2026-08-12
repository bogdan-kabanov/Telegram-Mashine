import { bootstrapApp } from "@/lib/bootstrap";

import { AdminShell, SectionCard } from "../components";
import { AiSettingsForm } from "./ai-settings-form";
import { ProxySettingsForm } from "./proxy-settings-form";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await bootstrapApp();

  return (
    <AdminShell
      title="Настройки"
      description="OpenAI, прокси для исходящих запросов сервера. Сохраняются в config/ и применяются без перезапуска."
    >
      <SectionCard
        title="Прокси"
        tip="Все запросы Telegram и OpenAI с сервера пойдут через этот прокси (серверные ISP http/https)."
        description="Формат: http://login:password@ip:port"
      >
        <ProxySettingsForm />
      </SectionCard>

      <SectionCard
        title="Ключ, модели и режимы AI"
        tip="Ключ можно вставить здесь или оставить в .env — настройки имеют приоритет."
        tourId="tour-ai-settings"
      >
        <AiSettingsForm />
      </SectionCard>
    </AdminShell>
  );
}
