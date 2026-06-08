#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_DIR="$ROOT/backend"

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -o allexport
    # shellcheck source=/dev/null
    source "$env_file"
    set +o allexport
  fi
}

echo "[dev-start] root=$ROOT"

load_env_file "$FRONTEND_DIR/.env"
load_env_file "$BACKEND_DIR/.env"

fail() {
  echo "[dev-start] ERROR: $1" >&2
  exit 1
}

[[ -n "${EXPO_PUBLIC_BACKEND_URL:-}" ]] || fail "EXPO_PUBLIC_BACKEND_URL is not set in frontend/.env"
if [[ -z "${MONGO_URL:-}" ]]; then
  echo "[dev-start] WARNING: MONGO_URL is not set in backend/.env; using local fallback storage instead."
fi
if [[ -z "${DB_NAME:-}" ]]; then
  echo "[dev-start] WARNING: DB_NAME is not set in backend/.env; using default 'macrotrack'."
fi
if [[ -z "${EMERGENT_LLM_KEY:-}" && -z "${GOOGLE_AI_API_KEY:-}" ]]; then
  echo "[dev-start] WARNING: No AI key configured (EMERGENT_LLM_KEY or GOOGLE_AI_API_KEY). AI features will be disabled. Continuing..."
fi

echo "[dev-start] EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL"

cd "$BACKEND_DIR"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
echo "[dev-start] Installing backend Python dependencies (may warn on optional packages)..."
if ! pip install -r requirements.txt; then
  echo "[dev-start] WARNING: 'pip install -r requirements.txt' failed. Some optional packages may be unavailable (eg. emergentintegrations). Continuing startup..."
fi

if lsof -i :8000 >/dev/null 2>&1; then
  fail "Port 8000 is already in use. Stop the running process before starting dev mode."
fi

echo "[dev-start] Starting backend on port 8000..."
uvicorn server:app --reload --host 0.0.0.0 --port 8000 > "$ROOT/backend/dev.log" 2>&1 &
BACKEND_PID=$!
trap 'echo "[dev-start] Shutting down backend..."; kill "$BACKEND_PID" 2>/dev/null || true' EXIT

for i in $(seq 1 20); do
  if curl -sSf "$EXPO_PUBLIC_BACKEND_URL/api/" >/dev/null 2>&1; then
    echo "[dev-start] Backend ready"
    break
  fi
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    echo "[dev-start] Backend failed to start. See $ROOT/backend/dev.log"
    cat "$ROOT/backend/dev.log"
    exit 1
  fi
  echo "[dev-start] Waiting for backend... ($i/20)"
  sleep 1
done

cd "$FRONTEND_DIR"
if command -v yarn >/dev/null 2>&1; then
  yarn install
  echo "[dev-start] Starting Expo via yarn..."
  yarn expo start --lan
else
  echo "[dev-start] yarn not found; falling back to npm and npx"
  npm install
  echo "[dev-start] Starting Expo via npx..."
  npx expo start --lan
fi
