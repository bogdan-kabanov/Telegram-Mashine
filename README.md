# Bot AI — Генератор отзывов

Автоматизированная система генерации мобильных скриншотов Telegram-чатов, чеков и публикации отзывов.

## Этап 1 (текущий)

Модульный каркас на **Next.js 15** + **SQLite** + **HTML/CSS рендер** + **веб-админка**.

### Что реализовано

- **База данных SQLite** — очередь задач, логи, runtime state, медиа, загрузки конфигов
- **Веб-админка** — Dashboard, Проекты, Медиа, Настройки, Расписание
- **5 проектов** с индивидуальными темами (фон, цвета пузырей)
- **Chat Renderer** — HTML-шаблон мобильного Telegram → PNG через Playwright
- **OpenAI** — клиент-заглушка (gpt-4o-mini)
- **Telegram API** — только для публикации в канал (этап 5)
- Zod-валидация всех конфигов

## Быстрый старт

```bash
npm install
cp .env.example .env

npm run dev
# http://localhost:PORT/admin
```

## Docker (production)

```bash
# 1. Env
cp .env.docker.example .env
# заполнить TELEGRAM_*, OPENAI_*, APP_URL (публичный HTTPS)

# 2. Сборка и запуск
docker compose up -d --build

# 3. Webhook (если AUTO_SETUP_WEBHOOK=0)
curl -X POST http://localhost:3000/api/telegram/setup

# Админка: http://localhost:3000/admin
# Логи:    docker compose logs -f app
```

Тома: `./data`, `./config`, `./public/renders`. Для Chromium в compose задан `shm_size: 256mb`.

## Админка

| Раздел | Описание |
|--------|----------|
| `/admin` | Dashboard, управление, очередь, логи |
| `/admin/projects` | 5 проектов, превью PNG чата |
| `/admin/media` | Загрузка кружков, ставок, обоев |
| `/admin/settings` | Загрузка JSON (скрипты, легенды, банки) |
| `/admin/schedule` | Расписание 15 постов/день |
