import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { loadLegendsFromDisk } from "@/lib/config/writer";

import { AdminShell } from "../components";
import { MediaLibrary } from "./media-library";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await bootstrapApp();
  const [config, legends] = await Promise.all([loadAppConfig(), loadLegendsFromDisk()]);

  return (
    <AdminShell title="Медиа">
      <MediaLibrary
        projects={config.projects.projects.map((p) => ({ id: p.id, name: p.name }))}
        legends={legends.map((l) => ({ id: l.id, title: l.title }))}
      />
    </AdminShell>
  );
}
