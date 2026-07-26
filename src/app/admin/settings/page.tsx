import { bootstrapApp } from "@/lib/bootstrap";

import { AdminShell, SectionCard } from "../components";
import { LegendsEditor } from "./legends-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await bootstrapApp();

  return (
    <AdminShell
      title="Истории клиентов"
      description="Легенда — это короткая «биография» клиента в диалоге: зачем пишет, в чём сомневается, как благодарит. Бот выбирает легенду случайно и подставляет фразы."
    >
      <SectionCard
        title="Зачем это нужно"
        tip="Без разных историй все отзывы звучат одинаково."
        tourId="tour-stories-guide"
      >
        <div className="admin-steps">
          <div className="admin-step">
            <div className="admin-step-num">1</div>
            <div>
              <h3>Выберите историю слева</h3>
              <p>Или создайте новую — например «Мама на больничном» или «Долги по кредиту».</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">2</div>
            <div>
              <h3>Заполните тексты</h3>
              <p>Проблема, мотивация, фразы сомнения и благодарности. Пишите по-испански, как говорит клиент.</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">3</div>
            <div>
              <h3>Добавьте фото</h3>
              <p>В медиатеке загрузите «Фото клиента в чате» и привяжите к этой истории.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <section className="admin-card">
        <LegendsEditor />
      </section>
    </AdminShell>
  );
}
