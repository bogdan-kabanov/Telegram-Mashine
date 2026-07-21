import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getScheduler } from "@/modules/scheduler";

import { AdminShell, StatCard } from "../components";
import { styles } from "../styles";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await bootstrapApp();
  const config = await loadAppConfig();
  const upcoming = await getScheduler().getUpcomingTasks(15);

  return (
    <AdminShell title="Расписание">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <StatCard label="Постов в день" value={String(config.schedule.postsPerDay)} />
        <StatCard label="Задержка фаз" value={`${config.schedule.phaseDelayMinutes} мин`} />
        <StatCard label="Таймзона" value={config.schedule.timezone} />
      </div>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Время</th>
              <th style={styles.th}>Тип</th>
              <th style={styles.th}>Проект</th>
              <th style={styles.th}>Следующий запуск</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((task) => (
              <tr key={task.id}>
                <td style={styles.td}>{task.slot.id}</td>
                <td style={styles.td}>
                  {String(task.slot.hour).padStart(2, "0")}:{String(task.slot.minute).padStart(2, "0")}
                </td>
                <td style={styles.td}>{task.slot.reviewType}</td>
                <td style={styles.td}>{task.slot.projectId}</td>
                <td style={styles.td}>{new Date(task.nextRunAt).toLocaleString("ru-RU")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
