import { bootstrapApp } from "@/lib/bootstrap";

import { AdminShell } from "../components";
import { styles } from "../styles";
import { LegendsEditor } from "./legends-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await bootstrapApp();

  return (
    <AdminShell title="Легенды">
      <div style={styles.card}>
        <LegendsEditor />
      </div>
    </AdminShell>
  );
}
