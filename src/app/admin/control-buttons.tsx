"use client";

import { useState } from "react";

import { HelpTip } from "./ui/HelpTip";

export function ControlButtons({ currentStatus }: { currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function action(cmd: string) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setStatus(data.state.status);
      setMessage(data.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const statusLabel: Record<string, string> = {
    running: "Работает",
    paused: "На паузе",
    stopped: "Остановлен",
    error: "Ошибка",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button className="admin-btn" disabled={loading} onClick={() => action("start")} type="button">
          Запустить
        </button>
        <HelpTip text="Включает автоматическую генерацию и публикацию по расписанию." />

        <button className="admin-btn-secondary" disabled={loading} onClick={() => action("pause")} type="button">
          Пауза
        </button>
        <HelpTip text="Временно останавливает новые посты. Уже запланированная «часть 2» может ещё дойти." />

        <button className="admin-btn-secondary" disabled={loading} onClick={() => action("resume")} type="button">
          Продолжить
        </button>
        <HelpTip text="Снимает паузу и возвращает бота к обычному режиму." />

        <button
          className="admin-btn-secondary admin-btn-danger"
          disabled={loading}
          onClick={() => action("stop")}
          type="button"
        >
          Стоп
        </button>
        <HelpTip text="Полностью выключает воркер. Чтобы снова публиковать — нажмите «Запустить»." />
      </div>
      <p className="admin-muted" style={{ marginTop: "0.65rem", fontSize: "0.875rem", marginBottom: 0 }}>
        Сейчас: <strong style={{ color: "var(--admin-ink)" }}>{statusLabel[status] ?? status}</strong>
        {message ? ` · ${message}` : ""}
      </p>
    </div>
  );
}
