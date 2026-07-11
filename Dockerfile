# Presenter — single-image build. Server (Bun+Hono) serves the API, the
# WebSocket, the admin SPA (web/dist), and the shippable play.js (play/dist).

# ---- build ------------------------------------------------------------------
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY play/package.json ./play/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run --cwd web build && bun run --cwd play build

# ---- run --------------------------------------------------------------------
FROM oven/bun:1-alpine AS run
WORKDIR /app
# Only the runtime dep (hono) is needed; skip vite/react/etc.
COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY play/package.json ./play/
RUN bun install --frozen-lockfile --production
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/play/dist ./play/dist

ENV PORT=7737 DB_PATH=/data/presenter.sqlite
VOLUME /data
EXPOSE 7737
WORKDIR /app/server
CMD ["bun", "src/index.ts"]
