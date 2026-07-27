import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getRecentReviewsByProject } from "@/lib/db/reviews";
import { listLocalesFromConfig } from "@/lib/i18n/locale-profile";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";

import { AdminShell, SectionCard } from "../components";
import { ProjectWorkspace } from "../project-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await bootstrapApp();
  const config = await loadAppConfig();
  const locales = listLocalesFromConfig(config.geo);

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
    <AdminShell
      title="Проекты"
      description="Каждый проект — отдельный менеджер в чате. Сделайте пробный отзыв, чтобы увидеть, как выглядит переписка, и при необходимости поправьте фон, имя и цвета."
    >
      <SectionCard
        title="Как пользоваться этим разделом"
        tip="Короткая шпаргалка: сначала пробный отзыв, потом тонкая настройка."
        tourId="tour-projects-guide"
      >
        <div className="admin-steps">
          <div className="admin-step">
            <div className="admin-step-num">1</div>
            <div>
              <h3>Выберите проект</h3>
              <p>Nancy, Grisel, Melissa, Paola, Francesca — менеджеры, от имени которых идёт переписка.</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">2</div>
            <div>
              <h3>Сделайте пробный отзыв</h3>
              <p>Кнопка не публикует в канал — только показывает скриншоты здесь, в панели.</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">3</div>
            <div>
              <h3>При желании откройте «Настройки»</h3>
              <p>Здесь задаются язык/валюта, фон чата, имя, тексты реквизитов и цвета пузырей сообщений.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {projectsWithReviews.map(({ project, initialReview }) => (
        <ProjectWorkspace
          key={project.id}
          locales={locales}
          project={{
            id: project.id,
            name: project.name,
            locale: project.locale,
            currency: project.currency,
            managerHandle: project.managerHandle,
            managerName: project.managerName,
            twoPhaseReview: project.twoPhaseReview,
            wallpaperPath: project.wallpaperPath ?? null,
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
