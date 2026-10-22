#!/usr/bin/env bash
# Assembles a runnable Next.js standalone server: static assets, public files and migrations (for /api/health/ready).
set -euo pipefail
test -f .next/standalone/server.js || { echo "Run 'pnpm build' first (output: standalone)"; exit 1; }
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp -r drizzle .next/standalone/drizzle
echo "standalone server ready: node .next/standalone/server.js"
