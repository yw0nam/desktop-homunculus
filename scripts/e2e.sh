#!/usr/bin/env bash
# desktop-homunculus/scripts/e2e.sh
# Shell-automatable E2E phases for desktopmate-bridge UI.
# Starts mock-homunculus + Vite dev server, verifies HTTP 200, checks for
# console.error output, then tears down cleanly.
#
# Usage:
#   ./scripts/e2e.sh                   # auto port (4000-4499)
#   UI_PORT=4321 ./scripts/e2e.sh      # fixed port

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MOD_DIR="${REPO_ROOT}/mods/desktopmate-bridge"
UI_DIR="${MOD_DIR}/ui"

MOCK_PORT=3100
UI_PORT="${UI_PORT:-$((RANDOM % 500 + 4000))}"
WAIT_TIMEOUT=30   # seconds to wait for servers to be ready

MOCK_PID=""
UI_PID=""

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

cleanup() {
  local exit_code=$?
  if [[ -n "${UI_PID}" ]]; then
    kill "${UI_PID}" 2>/dev/null || true
  fi
  if [[ -n "${MOCK_PID}" ]]; then
    kill "${MOCK_PID}" 2>/dev/null || true
  fi
  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

wait_for_http() {
  local url="$1"
  local label="$2"
  local elapsed=0
  echo "[e2e] Waiting for ${label} at ${url} ..."
  while ! curl -sf "${url}" -o /dev/null 2>/dev/null; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [[ "${elapsed}" -ge "${WAIT_TIMEOUT}" ]]; then
      echo "[e2e] TIMEOUT: ${label} did not respond within ${WAIT_TIMEOUT}s"
      return 1
    fi
  done
  echo "[e2e] ${label} is up (${elapsed}s)"
}

assert_http_200() {
  local url="$1"
  local status
  status=$(curl -so /dev/null -w "%{http_code}" "${url}")
  if [[ "${status}" != "200" ]]; then
    echo "[e2e] FAILED: expected HTTP 200 from ${url}, got ${status}"
    return 1
  fi
  echo "[e2e] HTTP 200 OK: ${url}"
}

# ---------------------------------------------------------------------------
# Phase 1: Start mock-homunculus
# ---------------------------------------------------------------------------

echo "[e2e] Starting mock-homunculus on port ${MOCK_PORT} ..."
npx --prefix "${MOD_DIR}" tsx "${MOD_DIR}/scripts/mock-homunculus.ts" \
  > /tmp/mock-homunculus.log 2>&1 &
MOCK_PID=$!

# ---------------------------------------------------------------------------
# Phase 2: Start Vite dev server
# ---------------------------------------------------------------------------

echo "[e2e] Starting Vite dev server on port ${UI_PORT} ..."
cd "${UI_DIR}"
pnpm vite dev --port "${UI_PORT}" --strictPort \
  > /tmp/vite-dev.log 2>&1 &
UI_PID=$!
cd "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Phase 3: Wait for both servers
# ---------------------------------------------------------------------------

wait_for_http "http://127.0.0.1:${MOCK_PORT}" "mock-homunculus"
wait_for_http "http://127.0.0.1:${UI_PORT}"   "vite-dev"

# ---------------------------------------------------------------------------
# Phase 4: HTTP 200 assertions
# ---------------------------------------------------------------------------

assert_http_200 "http://127.0.0.1:${MOCK_PORT}"
assert_http_200 "http://127.0.0.1:${UI_PORT}"

# ---------------------------------------------------------------------------
# Phase 5: Check for console.error in Vite output
# ---------------------------------------------------------------------------

echo "[e2e] Checking Vite output for console.error ..."
if grep -qi "console\.error\|Uncaught\|Error:" /tmp/vite-dev.log 2>/dev/null; then
  echo "[e2e] FAILED: console.error or error output detected in Vite log:"
  grep -i "console\.error\|Uncaught\|Error:" /tmp/vite-dev.log || true
  echo "FAILED"
  exit 1
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo "PASSED"
