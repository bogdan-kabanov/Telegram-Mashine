"use client";

import { useState } from "react";

import { HelpTip } from "../ui/HelpTip";

export function BetReuseSettings({ initialDays }: { initialDays: number }) {
  const [days, setDays] = useState(initialDays);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betReuseDays: days }),
      });
      const data = (await res.json()) as { error?: string; schedule?: { betReuseDays: number } };
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
            text="Сколько дней нельзя повторять ту же картинку ставки. 0 — только цикл паков 1→N→1 без паузы. По Владу обычно 5."
            placement="below"
          />
        </span>
        <input
          type="number"
          min={0}
          max={90}
          step={1}
          value={days}
          disabled={saving}
          onChange={(e) => setDays(Number(e.target.value))}
        />
      </label>
      <button type="submit" className="admin-btn" disabled={saving}>
        {saving ? "…" : "Сохранить"}
      </button>
      {message ? <span className="admin-muted">{message}</span> : null}
    </form>
  );
}
