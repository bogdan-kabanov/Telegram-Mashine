import Link from "next/link";

import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getActiveCycleWeekInfo } from "@/lib/schedule/cycle";
import { getRuntimeManager } from "@/lib/runtime/manager";
import { getScheduler } from "@/modules/scheduler";

import { AdminShell, SectionCard, StatCard } from "./components";
import { ControlButtons } from "./control-buttons";
import { colors } from "./styles";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  running: "Работает",
  paused: "На паузе",
  stopped: "Остановлен",
  error: "Ошибка",
};

const PHASE_LABEL: Record<string, string> = {
  idle: "Ожидание",
  generating: "Готовит отзыв",
  phase_1: "Публикует часть 1",
  phase_2: "Публикует часть 2",
};

export default async function AdminDashboard() {
  await bootstrapApp();

  const runtime = getRuntimeManager();
  const [state, logs, config, upcoming, queue] = await Promise.all([
    runtime.getState(),
    runtime.getRecentLogs(10),
    loadAppConfig(),
    getScheduler().getUpcomingTasks(5),
    runtime.getQueue(5),
  ]);

  const cycle = getActiveCycleWeekInfo(config.schedule);

  const statusColor: Record<string, string> = {
    running: colors.success,
    paused: colors.warning,
    stopped: colors.muted,
    error: colors.danger,
  };

  return (
    <AdminShell
      title="Главная"
      description="Здесь видно, работает ли система, и можно её запустить. Обучение — кнопка «Обучение» слева в меню: подсветит блоки и объяснит, за что они отвечают."
    >
      <div className="admin-grid" data-tour="tour-home-stats">
        <StatCard
          label="Состояние"
          value={STATUS_LABEL[state.status] ?? state.status}
          color={statusColor[state.status] ?? colors.muted}
          tip="«Работает» значит бот сам публикует по расписанию. «На паузе» — генерация остановлена, но данные сохранены."
        />
        <StatCard
          label="Сейчас делает"
          value={PHASE_LABEL[state.currentPhase] ?? state.currentPhase}
          tip="Текущий этап работы: ожидание, генерация скриншотов или публикация в Telegram."
        />
        <StatCard
          label="Готово отзывов"
          value={String(state.totalReviewsGenerated)}
          tip="Сколько пакетов отзывов бот уже собрал (скриншоты + медиа)."
        />
        <StatCard
          label="Ушло в канал"
          value={String(state.totalReviewsPublished)}
          tip="Сколько отзывов успешно отправлено в Telegram-канал."
        />
        <StatCard
          label="Неделя цикла"
          value={cycle.label}
          tip="Расписание крутится 3 недели подряд (A → B → C), затем снова с A."
        />
      </div>

      <SectionCard
        title="Управление"
        tip="Эти кнопки включают и выключают автоматическую работу. Без «Запустить» посты не уйдут в канал."
        description="Сначала загрузите медиа и проверьте проекты в Конструкторе. Потом нажмите «Запустить»."
        tourId="tour-home-controls"
      >
        <ControlButtons currentStatus={state.status} />
      </SectionCard>

      <SectionCard
        title="Быстрый старт"
        tip="Короткий чеклист: что сделать перед первым запуском."
        description="Пройдите по пунктам — так вы ничего не пропустите."
        tourId="tour-home-checklist"
      >
        <div className="checklist">
          <Link href="/admin/constructor" className="checklist-item">
            <span className="checklist-icon is-todo">1</span>
            <div>
              <strong>Пройти конструктор</strong>
              <div className="admin-muted" style={{ fontSize: "0.84rem" }}>
                Фон, условия, тексты, медиа и пробный отзыв — в одной вкладке по шагам ТЗ
              </div>
            </div>
            <span className="admin-muted">→</span>
          </Link>
          <Link href="/admin/schedule" className="checklist-item">
            <span className="checklist-icon is-todo">2</span>
            <div>
              <strong>Посмотреть расписание</strong>
              <div className="admin-muted" style={{ fontSize: "0.84rem" }}>
                Когда и по каким проектам уйдут посты
              </div>
            </div>
            <span className="admin-muted">→</span>
          </Link>
          <div className="checklist-item">
            <span className={`checklist-icon ${state.status === "running" ? "is-done" : "is-todo"}`}>
              {state.status === "running" ? "✓" : "3"}
            </span>
            <div>
              <strong>Запустить систему</strong>
              <div className="admin-muted" style={{ fontSize: "0.84rem" }}>
                Кнопка «Запустить» выше на этой странице
              </div>
            </div>
            <span className={`admin-badge ${state.status === "running" ? "is-ok" : "is-off"}`}>
              {STATUS_LABEL[state.status] ?? state.status}
            </span>
          </div>
        </div>
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.85rem" }}>
        <SectionCard
          title="Очередь задач"
          tip="Список того, что бот планирует сделать прямо сейчас: сгенерировать отзыв или опубликовать вторую часть."
          {...(queue.length === 0
            ? { description: "Сейчас очередь пустая — это нормально в ожидании слота." }
            : {})}
        >
          {queue.length === 0 ? (
            <p className="admin-muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              Пусто
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Что делает</th>
                  <th>Проект</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((task) => (
                  <tr key={task.id}>
                    <td>{task.type === "generate_review" ? "Готовит отзыв" : task.type === "publish_phase_2" ? "Публикует часть 2" : task.type}</td>
                    <td>{task.projectId}</td>
                    <td>{task.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard
          title="Ближайшие публикации"
          tip="Следующие слоты по расписанию (время Мехико). Бот сам сработает в эти окна, если система запущена."
        >
          {upcoming.map((task) => (
            <div
              key={task.id}
              style={{
                padding: "0.45rem 0",
                borderBottom: "1px solid var(--admin-line)",
                fontSize: "0.875rem",
              }}
            >
              <strong>{task.slot.projectId}</strong>
              {" · "}
              {String(task.slot.hour).padStart(2, "0")}:{String(task.slot.minute).padStart(2, "0")}
              {" · "}
              <span className="admin-muted">{task.slot.reviewType === "big" ? "большой" : task.slot.reviewType === "small" ? "маленький" : "кружок"}</span>
              <div className="admin-muted" style={{ fontSize: "0.78rem" }}>
                {new Date(task.nextRunAt).toLocaleString("ru-RU")}
              </div>
            </div>
          ))}
        </SectionCard>
      </div>

      <SectionCard
        title="Журнал событий"
        tip="Технические сообщения системы. Если что-то пошло не так — ищите строки красным цветом."
      >
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", maxHeight: 200, overflow: "auto" }}>
          {logs.length === 0 ? (
            <p className="admin-muted" style={{ margin: 0 }}>
              Пока записей нет
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                style={{
                  color: log.level === "error" ? colors.danger : "var(--admin-ink)",
                  padding: "2px 0",
                }}
              >
                [{log.timestamp.slice(11, 19)}] {log.module}: {log.message}
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </AdminShell>
  );
}
