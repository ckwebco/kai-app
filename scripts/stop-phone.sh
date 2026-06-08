#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

stop_process() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if [[ -n "$pid" ]]; then
      echo "[stop-phone] Stopping pid $pid from $pid_file"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

stop_process "$ROOT/backend/run-local-backend.pid"
stop_process "$ROOT/frontend/run-local-expo.pid"

echo "[stop-phone] Stopped local backend and Expo if they were running."
