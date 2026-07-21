"use client";

import { useState } from "react";

import { colors, styles } from "./styles";

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

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button style={styles.button} disabled={loading} onClick={() => action("start")}>
          Запустить
        </button>
        <button style={styles.buttonSecondary} disabled={loading} onClick={() => action("pause")}>
          Пауза
        </button>
        <button style={styles.buttonSecondary} disabled={loading} onClick={() => action("resume")}>
          Продолжить
        </button>
        <button style={{ ...styles.buttonSecondary, color: colors.danger, borderColor: colors.danger }} disabled={loading} onClick={() => action("stop")}>
          Стоп
        </button>
      </div>
      <p style={{ color: colors.muted, marginTop: "0.5rem", fontSize: "0.875rem", marginBottom: 0 }}>
        {status}
        {message ? ` · ${message}` : ""}
      </p>
    </div>
  );
}
