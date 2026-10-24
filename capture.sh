#!/usr/bin/env bash
# Capture desktop and mobile screenshots of a running preview.
set -euo pipefail
: "${CAPTURE_URL:?CAPTURE_URL is required}"
: "${CAPTURE_DIR:?CAPTURE_DIR is required}"
: "${RUNTIME_DIR:?RUNTIME_DIR is required}"

mkdir -p "$CAPTURE_DIR"
echo "[capture] URL=$CAPTURE_URL DIR=$CAPTURE_DIR"

# Run the runtime capture implementation (timed). It opens the URL in a
# browser, waits for rendered content, captures desktop/mobile views as
# final-desktop.png and final-mobile.png, then closes the browser.
# Exit 75 for temporary navigation/browser infra failures, 1 for defects.
/usr/bin/time -p node "${RUNTIME_DIR:?}/scripts/default-capture.mjs"
