#!/usr/bin/env bash
# Start the TFTP server website and publish deployment metadata.
# Serves in the foreground on PORT (default 3000).
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
export PORT="${PORT:-3000}"
export STATIC_DIR="${PROJECT_DIR}/dist"
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR is required}"

echo "[start] PROJECT_DIR=$PROJECT_DIR PORT=$PORT STATIC_DIR=$STATIC_DIR"

# Install dependencies (timed)
/usr/bin/time -p npm install --no-audit --no-fund

# Build static output into dist/ (timed)
/usr/bin/time -p bash -c 'mkdir -p "$STATIC_DIR" && cp -r public/. "$STATIC_DIR"/'

# Publish deployment metadata for the controller (timed)
/usr/bin/time -p node -e '
const fs = require("fs");
fs.mkdirSync(process.env.OPENCODE_WEB_DIR, { recursive: true });
fs.writeFileSync(
  process.env.OPENCODE_WEB_DIR + "/deployment-output.json",
  JSON.stringify({ project: process.env.PROJECT_DIR, directory: process.env.STATIC_DIR })
);
console.log("deployment-output.json written ->", process.env.STATIC_DIR);
'

# Serve the app in the foreground
exec node server.js
