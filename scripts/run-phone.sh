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

fail() {
  echo "[run-phone] ERROR: $1" >&2
  exit 1
}

load_env_file "$FRONTEND_DIR/.env"
load_env_file "$BACKEND_DIR/.env"

[[ -n "${EXPO_PUBLIC_BACKEND_URL:-}" ]] || fail "EXPO_PUBLIC_BACKEND_URL is not set in frontend/.env"
if [[ -z "${MONGO_URL:-}" ]]; then
  echo "[run-phone] WARNING: MONGO_URL is not set in backend/.env; using local fallback storage instead."
fi
if [[ -z "${DB_NAME:-}" ]]; then
  echo "[run-phone] WARNING: DB_NAME is not set in backend/.env; using default 'macrotrack'."
fi

if [[ -z "${EMERGENT_LLM_KEY:-}" && -z "${GOOGLE_AI_API_KEY:-}" ]]; then
  echo "[run-phone] WARNING: No AI key configured; image analysis will fall back to manual scanning or placeholder responses."
fi

cd "$BACKEND_DIR"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate

pip install -r requirements.txt || echo "[run-phone] WARNING: pip install failed; optional packages may be unavailable."

if lsof -i :8000 >/dev/null 2>&1; then
  fail "Port 8000 is already in use. Stop the process on port 8000 and try again."
fi

BACKEND_LOG="$ROOT/backend/run-local-backend.log"
BACKEND_PID_FILE="$ROOT/backend/run-local-backend.pid"
nohup .venv/bin/python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8000 > "$BACKEND_LOG" 2>&1 &
backend_pid=$!
echo "$backend_pid" > "$BACKEND_PID_FILE"

sleep 3
if ! curl -sSf "$EXPO_PUBLIC_BACKEND_URL/api/" >/dev/null 2>&1; then
  echo "[run-phone] Backend did not become ready. See $BACKEND_LOG"
  cat "$BACKEND_LOG"
  exit 1
fi

echo "[run-phone] Backend started on $EXPO_PUBLIC_BACKEND_URL (pid=$backend_pid)"

cd "$FRONTEND_DIR"
if command -v yarn >/dev/null 2>&1; then
  frontend_cmd="yarn expo start --lan --non-interactive"
else
  frontend_cmd="npx expo start --lan --non-interactive"
fi

FRONTEND_LOG="$ROOT/frontend/run-local-expo.log"
FRONTEND_PID_FILE="$ROOT/frontend/run-local-expo.pid"
nohup bash -lc "$frontend_cmd" > "$FRONTEND_LOG" 2>&1 &
expo_pid=$!
echo "$expo_pid" > "$FRONTEND_PID_FILE"

sleep 3
if ! curl -sSf "http://127.0.0.1:8086/" >/dev/null 2>&1 && ! curl -sSf "http://192.168.1.97:8086/" >/dev/null 2>&1; then
  echo "[run-phone] Expo did not become ready yet. Check $FRONTEND_LOG"
fi

echo "[run-phone] Expo attempted to start on exp://192.168.1.97:8086"
echo "[run-phone] Backend log: $BACKEND_LOG"
echo "[run-phone] Expo log: $FRONTEND_LOG"
echo "[run-phone] To stop, run: ./scripts/stop-phone.sh"
