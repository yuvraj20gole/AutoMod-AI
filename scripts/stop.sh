#!/usr/bin/env bash
# AutoMod AI — free stuck ports (default: engine 8001 + web app 3000).
#
#   bash scripts/stop.sh           # stop whatever holds :8001 and :3000
#   bash scripts/stop.sh 8001      # stop only the given port(s)

set -u
PORTS=("$@")
if [ "${#PORTS[@]}" -eq 0 ]; then
  PORTS=(8001 3000)
fi

for port in "${PORTS[@]}"; do
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    echo "Port $port: nothing running."
    continue
  fi
  echo "Port $port: stopping PID(s) $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 2
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Port $port: still held, forcing (kill -9 $pids)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
  if lsof -ti "tcp:$port" >/dev/null 2>&1; then
    echo "Port $port: WARNING — still in use. Check: lsof -i :$port"
  else
    echo "Port $port: free."
  fi
done

# Leftover Detailed (Qwen) runner subprocesses — free RAM even if the parent died.
if pgrep -fl 'inference/qwen/runner.py|mflux-generate-qwen-edit' >/dev/null 2>&1; then
  echo "Stopping leftover Qwen/mflux runner process(es)…"
  pkill -f 'inference/qwen/runner.py' 2>/dev/null || true
  pkill -f 'mflux-generate-qwen-edit' 2>/dev/null || true
  sleep 1
  echo "Qwen runners cleared."
else
  echo "No leftover Qwen runner processes."
fi
