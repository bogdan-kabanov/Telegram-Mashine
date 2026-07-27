import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getActiveCycleWeekInfo, getActiveScheduleSlots } from "@/lib/schedule/cycle";
import type { ScheduleSlot } from "@/lib/schemas";
import { getMexicoCityParts, getMexicoDateKey } from "@/lib/timezone";

import { AdminShell, SectionCard } from "../components";
import { HelpTip } from "../ui/HelpTip";
import { BetReuseSettings } from "./bet-reuse-settings";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const HOUR_PX = 48;

type CalendarEvent = {
  id: string;
  dateKey: string;
  hour: number;
  minute: number;
  projectId: string;
  reviewType: ScheduleSlot["reviewType"];
  past: boolean;
};

function addDaysToDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function dateFromMexicoKey(key: string): Date {
  return new Date(`${key}T18:00:00.000Z`);
}

function buildWeekEvents(config: Awaited<ReturnType<typeof loadAppConfig>>, dayCount = 7) {
  const now = new Date();
  const todayKey = getMexicoDateKey(now);
  const nowParts = getMexicoCityParts(now);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;

  const days = Array.from({ length: dayCount }, (_, i) => {
    const key = addDaysToDateKey(todayKey, i);
    const parts = getMexicoCityParts(dateFromMexicoKey(key));
    return {
      key,
      label: String(parts.day),
      weekday: DAY_LABELS[parts.dayOfWeek] ?? "",
      isToday: key === todayKey,
    };
  });

  const events: CalendarEvent[] = [];
  for (const day of days) {
    const slots = getActiveScheduleSlots(config.schedule, dateFromMexicoKey(day.key));
    for (const slot of slots) {
      const slotMinutes = slot.hour * 60 + slot.minute;
      const past = day.isToday ? slotMinutes < nowMinutes : day.key < todayKey;
      events.push({
        id: `${day.key}:${slot.id}`,
        dateKey: day.key,
        hour: slot.hour,
        minute: slot.minute,
        projectId: slot.projectId,
        reviewType: slot.reviewType,
        past,
      });
    }
  }

  return { days, events, nowMinutes };
}

function reviewTypeShort(t: ScheduleSlot["reviewType"]): string {
  if (t === "big") return "большой";
  if (t === "small") return "маленький";
  return "кружок";
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default async function SchedulePage() {
  await bootstrapApp();
  const config = await loadAppConfig();
  const cycle = getActiveCycleWeekInfo(config.schedule);
  const { days, events, nowMinutes } = buildWeekEvents(config, 7);

  const minutes = events.map((e) => e.hour * 60 + e.minute);
  const minHour = Math.max(0, Math.floor(Math.min(...(minutes.length ? minutes : [7 * 60])) / 60) - 1);
  const maxHour = Math.min(23, Math.ceil(Math.max(...(minutes.length ? minutes : [23 * 60])) / 60));
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const rangeStart = minHour * 60;
  const rangeEnd = (maxHour + 1) * 60;
  const gridHeight = ((rangeEnd - rangeStart) / 60) * HOUR_PX;

  const byDay = new Map<string, CalendarEvent[]>();
  for (const day of days) byDay.set(day.key, []);
  for (const event of events) byDay.get(event.dateKey)?.push(event);

  const todayCount = events.filter((e) => e.dateKey === days[0]?.key).length;

  return (
    <AdminShell
      title="Расписание"
      description="Когда бот публикует отзывы. Время — Мехико. Если система запущена, слоты отрабатывают сами."
    >
      <ul className="schedule-meta">
        <li className="schedule-meta-item">
          <span className="schedule-meta-label">
            Постов в день
            <HelpTip text="Сколько публикаций за сутки по слотам." placement="below" />
          </span>
          <span className="schedule-meta-value">{config.schedule.postsPerDay}</span>
        </li>
        <li className="schedule-meta-item">
          <span className="schedule-meta-label">
            Пауза между частями
            <HelpTip text="Для Nancy: пауза между первой частью (4 скрина) и полным отзывом." placement="below" />
          </span>
          <span className="schedule-meta-value">{config.schedule.phaseDelayMinutes} мин</span>
        </li>
        <li className="schedule-meta-item">
          <span className="schedule-meta-label">
            Часовой пояс
            <HelpTip
              text={`Все слоты считаются по ${config.schedule.timezone.replace(/_/g, " ")}.`}
              placement="below"
            />
          </span>
          <span className="schedule-meta-value">Мехико</span>
        </li>
        <li className="schedule-meta-item">
          <span className="schedule-meta-label">
            Текущая неделя
            <HelpTip text="Трёхнедельный цикл A → B → C. Сейчас активна эта неделя." placement="below" />
          </span>
          <span className="schedule-meta-value">{cycle.label}</span>
        </li>
      </ul>

      <SectionCard
        title="Кулдаун картинок ставок"
        tip="Настройка из schedule.json → betReuseDays."
        description="Паки идут по кругу 1→N→1. Кулдаун не даёт взять ту же картинку слишком рано."
      >
        <BetReuseSettings initialDays={config.schedule.betReuseDays} />
      </SectionCard>

      <SectionCard
        title="Как читать календарь"
        tip="Короткая шпаргалка по цветам и типам."
        description={`Сегодня в сетке около ${todayCount} слотов. Красная линия — текущее время.`}
      >
        <div className="schedule-cal-legend">
          <span className="schedule-cal-pill is-big">большой отзыв</span>
          <span className="schedule-cal-pill is-small">маленький</span>
          <span className="schedule-cal-pill is-circle">кружок</span>
          <span className="admin-muted" style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
            цвет слева у блока = проект <HelpTip text="nancy, grisel, melissa, paola, francesca — разные менеджеры." />
          </span>
        </div>
      </SectionCard>

      <section className="admin-card schedule-cal" data-tour="tour-schedule-slots">
        <div className="schedule-cal-head">
          <h2 className="admin-card-title">Календарь на 7 дней</h2>
        </div>

        <div className="schedule-cal-scroll">
          <div className="schedule-cal-week">
            <div className="schedule-cal-corner" />
            {days.map((day) => (
              <div key={day.key} className={`schedule-cal-col-head${day.isToday ? " is-today" : ""}`}>
                <span className="schedule-cal-weekday">{day.weekday}</span>
                <span className="schedule-cal-date">{day.label}</span>
              </div>
            ))}

            <div className="schedule-cal-hours" style={{ height: gridHeight }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="schedule-cal-hour"
                  style={{ top: ((hour * 60 - rangeStart) / 60) * HOUR_PX }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {days.map((day) => {
              const dayEvents = byDay.get(day.key) ?? [];
              return (
                <div
                  key={day.key}
                  className={`schedule-cal-col${day.isToday ? " is-today" : ""}`}
                  style={{ height: gridHeight }}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="schedule-cal-gridline"
                      style={{ top: ((hour * 60 - rangeStart) / 60) * HOUR_PX }}
                    />
                  ))}

                  {day.isToday ? (
                    <div
                      className="schedule-cal-now"
                      style={{ top: ((nowMinutes - rangeStart) / 60) * HOUR_PX }}
                    />
                  ) : null}

                  {dayEvents.map((event) => {
                    const start = event.hour * 60 + event.minute;
                    const top = ((start - rangeStart) / 60) * HOUR_PX;
                    return (
                      <div
                        key={event.id}
                        className={[
                          "schedule-cal-event",
                          `is-${event.reviewType}`,
                          `proj-${event.projectId}`,
                          event.past ? "is-past" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ top, height: HOUR_PX - 6 }}
                        title={`${formatTime(event.hour, event.minute)} · ${event.projectId} · ${reviewTypeShort(event.reviewType)}`}
                      >
                        <time className="schedule-cal-event-time">
                          {formatTime(event.hour, event.minute)}
                        </time>
                        <span className="schedule-cal-event-project">{event.projectId}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
