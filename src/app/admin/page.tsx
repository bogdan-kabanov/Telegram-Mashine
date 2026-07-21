import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getRuntimeManager } from "@/lib/runtime/manager";
import { getScheduler } from "@/modules/scheduler";

import { AdminShell, StatCard } from "./components";
import { ControlButtons } from "./control-buttons";
import { colors, styles } from "./styles";

export const dynamic = "force-dynamic";

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

  const statusColor: Record<string, string> = {
    running: colors.success,
    paused: colors.warning,
    stopped: colors.muted,
    error: colors.danger,
  };

  return (
    <AdminShell title="Обзор">
      <div style={styles.grid}>
        <StatCard label="Статус" value={state.status} color={statusColor[state.status] ?? colors.muted} />
        <StatCard label="Фаза" value={state.currentPhase} />
        <StatCard label="Сгенерировано" value={String(state.totalReviewsGenerated)} />
        <StatCard label="Опубликовано" value={String(state.totalReviewsPublished)} />
        <StatCard label="Проектов" value={String(config.projects.projects.length)} />
      </div>

      <div style={{ ...styles.card, marginBottom: "0.75rem" }}>
        <h2 style={styles.sectionTitle}>Управление</h2>
        <ControlButtons currentStatus={state.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Очередь</h2>
          {queue.length === 0 ? (
            <p style={{ color: colors.muted, margin: 0, fontSize: "0.875rem" }}>Пусто</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Тип</th>
                  <th style={styles.th}>Проект</th>
                  <th style={styles.th}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((task) => (
                  <tr key={task.id}>
                    <td style={styles.td}>{task.type}</td>
                    <td style={styles.td}>{task.projectId}</td>
                    <td style={styles.td}>{task.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Слоты</h2>
          {upcoming.map((task) => (
            <div
              key={task.id}
              style={{
                padding: "0.35rem 0",
                borderBottom: `1px solid ${colors.border}`,
                fontSize: "0.875rem",
              }}
            >
              {task.slot.projectId} · {String(task.slot.hour).padStart(2, "0")}:{String(task.slot.minute).padStart(2, "0")} ·{" "}
              {new Date(task.nextRunAt).toLocaleString("ru-RU")}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: "0.75rem" }}>
        <h2 style={styles.sectionTitle}>Логи</h2>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", maxHeight: 180, overflow: "auto" }}>
          {logs.map((log) => (
            <div key={log.id} style={{ color: log.level === "error" ? colors.danger : colors.text, padding: "1px 0" }}>
              [{log.timestamp.slice(11, 19)}] {log.module}: {log.message}
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
