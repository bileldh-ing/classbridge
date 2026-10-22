# syntax=docker/dockerfile:1.7
# Multi-stage production image: Next.js standalone output, non-root user, migrations bundled.

FROM node:25-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders only; real values come from the runtime environment.
ENV AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime-000 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_URL=https://build.invalid
RUN pnpm build && bash scripts/prepare-standalone.sh
# Small migration runner (drizzle migrator + pg) bundled next to the server.
RUN pnpm dlx esbuild@0.25.11 scripts/migrate.ts --bundle --platform=node --format=esm --outfile=.next/standalone/migrate.mjs \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:25-bookworm-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/private
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /data/private && chown -R nextjs:nodejs /data
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
USER nextjs
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run `node migrate.mjs` once per release (e.g. a release/pre-deploy command), then start the server.
CMD ["node", "server.js"]
