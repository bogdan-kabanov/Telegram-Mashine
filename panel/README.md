# Panel SPA (Vite)

Клиентский интерфейс без SSR.

## Dev

1. Запусти Next: `npm run dev` (порт 3000)
2. Запусти panel: `npm run panel:dev` (порт 5173, proxy `/api` → 3000)
3. Открой http://127.0.0.1:5173/panel/

Либо после `npm run panel:build` — http://127.0.0.1:3000/panel/ из Next `public/panel`.

## Prod

`npm run build` собирает panel в `public/panel` и затем Next.
