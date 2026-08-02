ARG PLAYWRIGHT_VERSION=1.61.1

# ---- deps ----
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS deps
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

# ---- build ----
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS builder
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Dummy env so Next can compile routes that touch getEnv at analysis time
ENV TELEGRAM_BOT_TOKEN=build_placeholder_token
ENV TELEGRAM_WEBHOOK_SECRET=build_secret_placeholder
ENV TELEGRAM_ADMIN_IDS=1
ENV TELEGRAM_PUBLISH_CHANNEL_ID=-1001234567890
ENV APP_URL=http://localhost:3000
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p data/history data/scripts data/scenarios data/media

RUN npm run build \
  && npm prune --omit=dev

# ---- runtime ----
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DOCKER=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data
ENV CONFIG_DIR=/app/config

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/config ./config
COPY --from=builder /app/assets/fonts ./assets/fonts
COPY --from=builder /app/node_modules/emoji-datasource-apple/img/apple/64 ./assets/emoji/apple/64
COPY --from=builder /app/data/scripts ./data/scripts
COPY --from=builder /app/data/scenarios ./data/scenarios
COPY --from=builder /app/data/media ./data/media
COPY --from=builder /app/data/history ./data/history
COPY --from=builder /app/scripts/docker-entrypoint.mjs ./docker-entrypoint.mjs

RUN mkdir -p /app/data/logs /app/data/runtime /app/data/reviews /app/data/renders \
      /app/public/renders \
  && chown -R pwuser:pwuser /app

USER pwuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.mjs"]
CMD ["node", "server.js"]
