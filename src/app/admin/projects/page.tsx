import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getRecentReviewsByProject } from "@/lib/db/reviews";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";

import { AdminShell } from "../components";
import { ProjectWorkspace } from "../project-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await bootstrapApp();
  const config = await loadAppConfig();

  const projectsWithReviews = await Promise.all(
    config.projects.projects.map(async (project) => {
      const reviews = await getRecentReviewsByProject(project.id, 1);
      const last = reviews[0];
      return {
        project,
        initialReview: last
          ? {
              id: last.id,
              screenshots: last.screenshots.map(toPublicScreenshotUrl),
            }
          : null,
      };
    }),
  );

  return (
    <AdminShell title="Проекты">
      {projectsWithReviews.map(({ project, initialReview }) => (
        <ProjectWorkspace
          key={project.id}
          project={{
            id: project.id,
            name: project.name,
            locale: project.locale,
            currency: project.currency,
            managerHandle: project.managerHandle,
            managerName: project.managerName,
            twoPhaseReview: project.twoPhaseReview,
            theme: {
              incomingBubble: project.theme.incomingBubble,
              outgoingBubble: project.theme.outgoingBubble,
              accentColor: project.theme.accentColor,
            },
            depositMessageTemplate: project.depositMessageTemplate,
            payoutMessageTemplate: project.payoutMessageTemplate,
          }}
          initialReview={initialReview}
        />
      ))}
    </AdminShell>
  );
}
