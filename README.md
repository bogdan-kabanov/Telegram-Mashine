# Bot AI — Генератор отзывов

Автоматизированная система генерации мобильных скриншотов Telegram-чатов, чеков и публикации отзывов в канал.

## Статус по ТЗ

| Этап | Статус |
|------|--------|
| 1 Архитектура | готово |
| 2 Диалоги (+ AI agents) | готово |
| 3 Скриншоты (HTML → Playwright) | готово |
| 4 Чеки / медиапакет | готово (чеки — ИИ по образцам `receipt_templates`; ставки/кружки — upload / `seed:media`) |
| 5 Планировщик + публикация | готово |
| 6 Тесты / приёмка | готово (`npm test`) |

## Быстрый старт

```bash
npm install
cp .env.example .env

npm run seed:media   # placeholder PNG (ставки, условия, обои)
# реальные кружки (MP4) — загрузить в /admin/media

npm run dev
# http://localhost:PORT/admin
```

## Docker (production)

```bash
cp .env.docker.example .env
# TELEGRAM_*, OPENAI_*, APP_URL (публичный HTTPS)

docker compose up -d --build
curl -X POST http://localhost:3000/api/telegram/setup
```

## Ключевые правила (ТЗ)

- **Двухфаза** — только Nancy, задержка 90 мин; фаза 2 = полный альбом + медиа
- **Last 4** — уникальные в SQLite (`used_account_digits`)
- **Фото клиента** — каждое `story_photo` используется **один раз** (`used_client_photos`); при пустом пуле можно генерировать через OpenAI (`AI_CLIENT_PHOTOS=fallback|always`)
- **Трёхнедельный цикл** — `config/schedule.json` → `weeks[A/B/C]`, **15 отзывов/день** (3×5 проектов)
- **~9 скринов** на полный отзыв (пагинация подстраивается под длину диалога)
- **Еженедельный круг** — уникальный video note + `pinChatMessage`
- **OpenAI** — пишет **легенду + весь диалог**; без ключа — fallback на JSON-скрипты
- **Чеки** — ИИ (`gpt-image-1`) правит образцы из `data/media/receipt_templates/{project}`; без ключа/шаблона — HTML Playwright
- **Операционка** — раз в неделю загружать кружки и ставки; фото клиентов — в общий пул

## Что ждём от автора (ассеты)

- Фоны чата на 5 проектов
- Темы Telegram (дизайн чатов) на каждый проект
- Примеры готовых отзывов / фото клиентов
- (чеки уже заведены как `receipt_templates` по проектам)

## Команды

| Script | Описание |
|--------|----------|
| `npm run dev` | Dev-сервер |
| `npm test` | Vitest (цикл, last4, two-phase) |
| `npm run seed:media` | Placeholder-медиа |
| `npm run typecheck` | `tsc --noEmit` |

## Админка

| Раздел | Описание |
|--------|----------|
| `/admin` | Dashboard, управление, очередь, логи |
| `/admin/projects` | 5 проектов, превью PNG чата |
| `/admin/media` | Загрузка кружков, ставок, обоев |
| `/admin/settings` | Загрузка JSON (скрипты, легенды, банки) |
| `/admin/schedule` | Цикл 3 недели, 15 слотов/день |
