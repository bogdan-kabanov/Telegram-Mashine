"use client";

import { useMemo, useState } from "react";

import { HelpTip } from "../ui/HelpTip";

export function BetReuseSettings({
  initialDays,
  maxDays,
}: {
  initialDays: number;
  maxDays: number;
}) {
  const cappedInitial = Math.min(Math.max(0, initialDays), maxDays);
  const [days, setDays] = useState(cappedInitial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(() =>
    initialDays > maxDays
      ? `Текущее значение ${initialDays} выше лимита — сохраните ≤ ${maxDays}`
      : null,
  );

  const overLimit = useMemo(() => !Number.isFinite(days) || days < 0 || days > maxDays, [days, maxDays]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (overLimit) {
      setMessage(`Макс. ${maxDays} дней (по самому слабому проекту)`);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betReuseDays: days }),
      });
      const data = (await res.json()) as {
        error?: string;
        schedule?: { betReuseDays: number };
        betReuseMaxDays?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
      if (data.schedule) setDays(data.schedule.betReuseDays);
      setMessage("Сохранено");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="schedule-bet-reuse">
      <label className="schedule-bet-reuse-label">
        <span>
          Кулдаун ставок (дней)
          <HelpTip
            text={`Сколько дней нельзя повторять ту же картинку ставки. 0 — только цикл паков 1→N→1 без паузы. Макс. ${maxDays} — по проекту с наименьшим запасом уникальных ставок.`}
            placement="below"
          />
        </span>
        <input
          type="number"
          min={0}
          max={maxDays}
          step={1}
          value={Number.isFinite(days) ? days : 0}
          disabled={saving}
          onChange={(e) => setDays(Number(e.target.value))}
        />
      </label>
      <button type="submit" className="admin-btn" disabled={saving || overLimit}>
        {saving ? "…" : "Сохранить"}
      </button>
      <span className="admin-muted">макс. {maxDays} (по самому слабому проекту)</span>
      {message ? <span className="admin-muted">{message}</span> : null}
    </form>
  );
}
