#!/bin/sh
set -eu

SOURCE=$0
while [ -L "$SOURCE" ]; do
  SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)
  SOURCE=$(readlink "$SOURCE")
  case "$SOURCE" in
    /*) ;;
    *) SOURCE="$SOURCE_DIR/$SOURCE" ;;
  esac
done
ROOT=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)
STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/baum"
STATE_FILE="$STATE_DIR/inkly-editor-project"
PROJECT_DIR="${1:-${INKLY_PROJECT_DIR:-}}"

if [ -z "$PROJECT_DIR" ] && [ -f "$STATE_FILE" ]; then
  IFS= read -r PROJECT_DIR < "$STATE_FILE"
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "No Inkly project selected."
  echo "Run: inkly-editor /path/to/project"
  exit 1
fi

PROJECT_DIR=$(CDPATH= cd -- "$PROJECT_DIR" 2>/dev/null && pwd) || {
  echo "Inkly project not found: $PROJECT_DIR"
  exit 1
}

if [ ! -f "$PROJECT_DIR/interactive-demo.json" ] && [ ! -f "$PROJECT_DIR/demo.config.json" ]; then
  echo "Expected interactive-demo.json or demo.config.json in: $PROJECT_DIR"
  exit 1
fi

mkdir -p "$STATE_DIR"
printf '%s\n' "$PROJECT_DIR" > "$STATE_FILE"

NODE_BIN=$(command -v node)
CLI="$ROOT/node_modules/@inkly-org/interactive-demo-cli/dist/cli.js"
if [ ! -f "$CLI" ]; then
  echo "Inkly CLI is not installed. Run: cd $ROOT && SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install"
  exit 1
fi

PORT=$(
  "$NODE_BIN" -e '
    const net = require("node:net");
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port);
      server.close();
    });
  '
)
URL="http://127.0.0.1:$PORT/__demo/editor/"

echo "Inkly project: $PROJECT_DIR"
echo "Editor: $URL"
(sleep 1; open "$URL") &

exec env -u ELECTRON_RUN_AS_NODE "$NODE_BIN" "$CLI" dev "$PROJECT_DIR" --port "$PORT"
