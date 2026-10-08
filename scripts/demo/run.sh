#!/usr/bin/env bash
# Starts aidit against a throwaway home directory full of demo data.
# Your real HOME, agent configs and ~/.config/aidit are never touched.
#
#   scripts/demo/run.sh [port]        (default 4511)
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
port="${1:-4511}"
dir="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/aidit-demo.XXXXXX")" && pwd -P)"

node "$repo/scripts/demo/seed.mjs" "$dir" >/dev/null
home="$dir/home"

echo "Demo home: $home"
cd "$home/projects/acme-web"
HOME="$home" \
  XDG_CONFIG_HOME="$home/.config" \
  AIDIT_DATA_DIR="$home/.config/aidit" \
  exec node "$repo/bin/aidit.js" start --no-open --port "$port"
