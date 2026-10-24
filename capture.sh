#!/usr/bin/env bash
# Capture desktop and mobile screenshots of the running app.
set -euo pipefail
cd "$(dirname "$0")"

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact page to capture.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence output directory.}"
export CAPTURE_URL CAPTURE_DIR

RUNTIME="${OMGITHUB_PLAYWRIGHT_ROOT:-$HOME/.local/share/omgithub-playwright}"
if [[ -z "${DISPLAY:-}" && -s "$RUNTIME/display" ]]; then
  export DISPLAY=":$(<"$RUNTIME/display")"
fi
export OMGITHUB_PLAYWRIGHT_ROOT="$RUNTIME"
export OMGITHUB_CAPTURE_WEB_DIR="${OPENCODE_WEB_DIR:-}"

run() {
  local started finished status
  started=$(date +%s%N)
  set +e
  "$@"
  status=$?
  set -e
  finished=$(date +%s%N)
  printf '[time] %6d ms  %s\n' $(((finished - started) / 1000000)) "$*"
  return "$status"
}

run mkdir -p "$CAPTURE_DIR"

set +e
run node capture.mjs
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  run test -s "$CAPTURE_DIR/final-desktop.png"
  run test -s "$CAPTURE_DIR/final-mobile.png"
  run ls -lh "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"
fi
exit "$status"
