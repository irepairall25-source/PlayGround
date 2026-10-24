#!/usr/bin/env bash
# Build and serve the remote camera console in the foreground.
set -euo pipefail
cd "$(dirname "$0")"

WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
export PORT="${PORT:-${APP_PORT:-3000}}"
export npm_config_update_notifier=false

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

run mkdir -p "$WEB_DIR"
if [[ -f package.json ]]; then
  run npm install --no-audit --no-fund --ignore-scripts
fi
run node build.mjs
run node -e '
const fs = require("node:fs")
const path = require("node:path")
const project = process.cwd()
const directory = path.join(project, "dist")
const target = process.argv[1]
if (path.relative(project, directory).startsWith("..")) throw new Error("Build output escaped the project directory")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, JSON.stringify({ project, directory }))
console.log(`Wrote ${target} -> ${directory}`)
' "$WEB_DIR/deployment-output.json"

run node server.mjs
