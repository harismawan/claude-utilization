#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d
bun --filter claude-util-api db:migrate || true
exec bun run dev
