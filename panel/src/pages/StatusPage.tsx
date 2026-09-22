import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

type StatusPayload = {
  state: {
    status: string;
    currentPhase: string;
    totalReviewsGenerated: number;
    totalReviewsPublished: number;
    lastError?: string | null;
  };
  logs: Array<{ timestamp: string; level: string; module: string; message: string }>;
  config: {
    schedule: {
      postsPerDay: number;
      phaseDelayMinutes: number;
      timezone: string;
      cycleLabel: string;
      cycleWeekIndex: number;
    };
  };
  upcoming: Array<{
    id?: string;
    projectId?: string;
    scheduledAt?: string;
    type?: string;
    reviewType?: string;
  }>;
  queue?: Array<{
    id: string;
    type: string;
    projectId: string;
    status: string;
    scheduledAt: string;
  }>;
};

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

export function StatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await api<StatusPayload>("/api/admin/status");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "status failed");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function control(action: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message?: string }>("/api/admin/control", {
        method: "POST",
        json: { action },
      });
      setMsg(r.message ?? "OK");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "control failed");
    } finally {
      setBusy(false);
    }
  }

  const st = data?.state;
  const statusClass =
    st?.status === "running" ? "ok" : st?.status === "error" ? "danger" : "warn";

  return (
    <>
      <h1>Статус приложения</h1>
      <p className="sub">Рантайм бота, очередь и ближайшие слоты расписания.</p>
      {error ? <div className="err">{error}</div> : null}
      {msg ? <div className="okbox">{msg}</div> : null}

      <div className="grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="label">Состояние</div>
          <div className={`value ${statusClass}`}>
            {STATUS_LABEL[st?.status ?? ""] ?? st?.status ?? "—"}
          </div>
        </div>
        <div className="card">
          <div className="label">Сейчас</div>
          <div className="value">{PHASE_LABEL[st?.currentPhase ?? ""] ?? st?.currentPhase ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">Собрано</div>
          <div className="value">{st?.totalReviewsGenerated ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">В канал</div>
          <div className="value">{st?.totalReviewsPublished ?? "—"}</div>
        </div>
        <div className="card">
          <div className="label">Неделя цикла</div>
          <div className="value" style={{ fontSize: 16 }}>
            {data?.config.schedule.cycleLabel ?? "—"}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 22 }}>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void control("start")}>
          Старт
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void control("pause")}>
          Пауза
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void control("resume")}>
          Продолжить
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void control("stop")}>
          Стоп
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {st?.lastError ? <div className="err">Последняя ошибка: {st.lastError}</div> : null}

      <div className="section">
        <h3>Очередь</h3>
        <div className="card">
          {(data?.queue ?? []).length === 0 ? (
            <span className="muted">Пусто</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(data?.queue ?? []).map((q) => (
                <li key={q.id}>
                  <span className="pill">{q.status}</span> {q.type} · {q.projectId} · {q.scheduledAt}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="section">
        <h3>Ближайшие публикации</h3>
        <div className="card">
          {(data?.upcoming ?? []).length === 0 ? (
            <span className="muted">Нет задач</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data!.upcoming.map((u, i) => (
                <li key={u.id ?? i}>
                  {u.scheduledAt} · {u.projectId} · {u.reviewType ?? u.type}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="section">
        <h3>Журнал</h3>
        <div className="card logs">
          {(data?.logs ?? [])
            .slice()
            .reverse()
            .map((l, i) => (
              <div key={`${l.timestamp}-${i}`}>
                [{l.timestamp}] [{l.level}] [{l.module}] {l.message}
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
