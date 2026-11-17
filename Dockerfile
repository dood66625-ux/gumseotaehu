FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci --fetch-retries=1 --fetch-timeout=30000
# Explicit allowlist: never copy .env, var, .git, uploads or private docs.
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY assets ./assets
COPY db ./db
COPY scripts ./scripts
COPY next.config.ts tsconfig.json next-env.d.ts ./
RUN npm run landing && npm run build:merchant && npx next build && node scripts/sanitize-standalone.mjs && npm run build:worker && node scripts/check-secrets.mjs --built --deployment-only

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --fetch-retries=1 --fetch-timeout=30000 && npm cache clean --force

FROM node:24-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production APP_MODE=local EXTERNAL_EFFECTS=disabled DATABASE_PATH=/data/geumseo.sqlite
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/assets ./assets
COPY --from=build /app/scripts/toss-sandbox-client.mjs ./scripts/toss-sandbox-client.mjs
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node","dist/runtime-health.js","worker"]
CMD ["node","dist/worker.js"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APP_MODE=local EXTERNAL_EFFECTS=disabled DATABASE_PATH=/data/geumseo.sqlite
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/assets ./assets
COPY --from=build /app/dist/runtime-health.js ./dist/runtime-health.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node","dist/runtime-health.js","web"]
CMD ["node","server.js"]
