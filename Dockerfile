# syntax=docker/dockerfile:1

# ─── Этап 1: сборка фронтенда ───────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@11

# Сначала зависимости — слой кешируется, пока не меняется lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build

# ─── Этап 2: рантайм ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN npm install -g pnpm@11 \
  && addgroup -S app \
  && adduser -S app -G app

ENV NODE_ENV=production
ENV PORT=8787

# Только production-зависимости: express, pg, pglite, tsx
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared

RUN mkdir -p server/data && chown -R app:app /app
USER app

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
