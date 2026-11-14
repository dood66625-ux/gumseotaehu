FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM build AS worker
ENV APP_MODE=local EXTERNAL_EFFECTS=disabled DATABASE_PATH=/data/geumseo.sqlite
USER node
CMD ["npm","run","worker"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APP_MODE=local EXTERNAL_EFFECTS=disabled DATABASE_PATH=/data/geumseo.sqlite
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/assets ./assets
USER node
EXPOSE 3000
CMD ["node","server.js"]
