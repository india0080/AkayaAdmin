#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"

# Demo + emulator flags: no production Firebase credentials or sibling backend repo.
export NEXT_PUBLIC_USE_EMULATORS=1
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-akaya
export NEXT_PUBLIC_ADMIN_DEMO=1
export NEXT_TELEMETRY_DISABLED=1

exec npm run dev -- --hostname 0.0.0.0 --port "$PORT"
