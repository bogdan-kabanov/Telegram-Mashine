import { bootstrapApp } from "@/lib/bootstrap";
import { countUnusedClientPhotos } from "@/lib/client-photos";
import { loadAppConfig } from "@/lib/config/loader";
import { loadLegendsFromDisk } from "@/lib/config/writer";

import { AdminShell, SectionCard } from "../components";
import { MediaLibrary } from "./media-library";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await bootstrapApp();
  const [config, legends, photoPool] = await Promise.all([
    loadAppConfig(),
    loadLegendsFromDisk(),
    countUnusedClientPhotos(),
  ]);

  return (
    <AdminShell
      title="Медиатека"
      description="Медиа разложено по проектам: ставки, условия и кружки — у каждого менеджера свои. Фото клиентов и стикеры — в общем пуле. Фон чата задаётся в Проекты → Настройки."
    >
      <SectionCard
        title="Что загружать в первую очередь"
        tip="Минимум для нормальной работы: кружки + ставки + фото историй."
        tourId="tour-media-guide"
      >
        <div className="admin-steps">
          <div className="admin-step">
            <div className="admin-step-num">1</div>
            <div>
              <h3>Кружки (видео)</h3>
              <p>Короткие круглые видео. Без них полный отзыв выглядит «ненастоящим».</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">2</div>
            <div>
              <h3>Ставки и условия</h3>
              <p>Картинки, которые клиент «получает» в переписке на этапах ставок и условий.</p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">3</div>
            <div>
              <h3>Фото для историй</h3>
              <p>
                Загрузите сами или сгенерируйте ИИ ниже. Каждое фото — один раз. Сейчас в пуле{" "}
                <strong>
                  {photoPool.unused} свободных из {photoPool.total}
                </strong>
                {photoPool.unused === 0
                  ? " — без новых загрузок или AI_CLIENT_PHOTOS=fallback фото в отзыве не появится."
                  : "."}{" "}
                Если пул пуст и в .env стоит <code>AI_CLIENT_PHOTOS=fallback</code>, бот сам дорисует
                фото при отзыве.
              </p>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">4</div>
            <div>
              <h3>Чеки банков</h3>
              <p>
                Это не раздел «ставки» в медиатеке. Фото чека, который клиент шлёт после оплаты
                (OXXO / Spin / Mercado…), кладётся в{" "}
                <code>data/media/receipt_templates/&#123;project&#125;/</code> и прописывается в{" "}
                <code>config/projects.json</code> → <code>receiptTemplates.client</code> (чек
                пополнения) или <code>.manager</code> (чек выплаты). При отзыве ИИ подставит сумму,
                имена и дату на этот же кадр. Имя файла с <code>detail</code> / <code>papel</code> —
                бумажный чек; остальные чаще скрин приложения.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <MediaLibrary
        projects={config.projects.projects.map((p) => ({ id: p.id, name: p.name }))}
        legends={legends.map((l) => ({ id: l.id, title: l.title }))}
      />
    </AdminShell>
  );
}
