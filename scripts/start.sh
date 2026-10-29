#!/usr/bin/env bash
# AutoMod AI — start everything (engine on :8001 + web app on :3000).
#
#   npm run start:all        (or: bash scripts/start.sh)
#
# Checks prerequisites, starts the inference engine and the Next.js dev
# server together, waits for the engine to report ready, opens the app,
# and stops BOTH processes on Ctrl+C. If a port gets stuck afterwards,
# run scripts/stop.sh.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="$ROOT/inference"
ENGINE_PY="$ENGINE_DIR/.venv/bin/python"
HEALTH_URL="http://127.0.0.1:8001/health"
APP_URL="http://localhost:3000"

# ---- 1. Prerequisites -------------------------------------------------
missing=0
if [ ! -x "$ENGINE_PY" ]; then
  echo "MISSING: inference/.venv (the engine's Python environment)"
  echo "         Fix: cd inference && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  missing=1
fi
if [ ! -d "$ROOT/node_modules" ]; then
  echo "MISSING: node_modules (web app dependencies)"
  echo "         Fix: cd \"$ROOT\" && npm install"
  missing=1
fi
if [ ! -f "$ROOT/.env.local" ]; then
  echo "MISSING: .env.local (Supabase keys + INFERENCE_URL)"
  echo "         Fix: cp .env.local.example .env.local and fill in the values"
  echo "              (it must contain INFERENCE_URL=http://127.0.0.1:8001)"
  missing=1
fi
if [ "$missing" -ne 0 ]; then
  echo "Cannot start — fix the missing item(s) above and run this again."
  exit 1
fi

# ---- 2. Start both processes ------------------------------------------
ENGINE_PID=""
WEB_PID=""

# Kill a process and all its descendants (uvicorn / next-server are
# grandchildren of the subshells started below, so a plain kill of the
# subshell PID would leave them running).
stop_tree() {
  local pid="$1" child
  [ -z "$pid" ] && return
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    stop_tree "$child"
  done
  kill "$pid" 2>/dev/null
}

cleanup() {
  echo ""
  echo "Stopping AutoMod AI…"
  stop_tree "$ENGINE_PID"
  stop_tree "$WEB_PID"
  wait 2>/dev/null
  echo "Stopped. (If a port is still stuck, run: bash scripts/stop.sh)"
  exit 0
}
trap cleanup INT TERM

echo "Starting engine (inference server on http://127.0.0.1:8001)…"
(cd "$ENGINE_DIR" && "$ENGINE_PY" -m uvicorn server:app --host 127.0.0.1 --port 8001) &
ENGINE_PID=$!

echo "Starting web app (Next.js dev server on http://localhost:3000)…"
(cd "$ROOT" && npm run dev) &
WEB_PID=$!

# ---- 3. Wait for the engine -------------------------------------------
echo "Waiting for the engine to load the model (first start can take a minute)…"
for _ in $(seq 1 60); do
  if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
    echo "ERROR: the engine process exited early — check inference/requirements.txt"
    echo "       and that port 8001 is free (bash scripts/stop.sh frees it)."
    cleanup
  fi
  if curl -s "$HEALTH_URL" 2>/dev/null | grep -q '"ready":true'; then
    echo "Engine ready"
    break
  fi
  sleep 5
done
curl -s "$HEALTH_URL" 2>/dev/null | grep -q '"ready":true' || {
  echo "ERROR: engine did not report ready in time. Try: curl $HEALTH_URL"
  cleanup
}

# ---- 4. Open the app ----------------------------------------------------
# Give the dev server a moment so the browser doesn't land on a dead page.
for _ in $(seq 1 12); do
  curl -s -o /dev/null "$APP_URL" 2>/dev/null && break
  sleep 5
done
echo "Opening $APP_URL"
if command -v open >/dev/null 2>&1; then
  open "$APP_URL" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" || true
else
  echo "Open this in your browser: $APP_URL"
fi

# Detailed (Qwen) is a short-lived subprocess per job — nothing extra to start.
if ENGINES_JSON="$(curl -s http://127.0.0.1:8001/engines 2>/dev/null)" && echo "$ENGINES_JSON" | grep -q '"id": "detailed"'; then
  if echo "$ENGINES_JSON" | grep -q '"ready": true'; then
    DETAILED_MSG="Detailed: available (Qwen q4 + Lightning, ~4 min/edit, one job at a time)"
  else
    DETAILED_MSG="Detailed: unavailable — $(echo "$ENGINES_JSON" | sed -n 's/.*"reason": "\([^"]*\)".*/\1/p' | head -1)"
    [ -n "${DETAILED_MSG#Detailed: unavailable — }" ] || DETAILED_MSG="Detailed: unavailable (see GET /engines)"
  fi
elif [ -x "$HOME/.local/share/uv/tools/mflux/bin/python" ] || command -v mflux-generate-qwen-edit >/dev/null 2>&1; then
  if [ -d "$HOME/.cache/huggingface/hub/models--mflux-community--qwen-image-edit-2511-mflux-q4" ]; then
    DETAILED_MSG="Detailed: available (Qwen q4 + Lightning, ~4 min/edit, one job at a time)"
  else
    DETAILED_MSG="Detailed: mflux found but Qwen q4 model cache missing"
  fi
else
  DETAILED_MSG="Detailed: install mflux (uv tool install mflux) and download the q4 model to enable"
fi

echo ""
echo "AutoMod AI is running:"
echo "  Web app:  $APP_URL"
echo "  Engine:   http://127.0.0.1:8001  (health: $HEALTH_URL)"
echo "  $DETAILED_MSG"
echo "Press Ctrl+C to stop both."
wait
