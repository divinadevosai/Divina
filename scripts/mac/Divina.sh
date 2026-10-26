#!/bin/sh
# Divina.app/Contents/MacOS/Divina: starts Divina with its own copy of Node.js.
# (scripts/desktop/launcher.cjs does the work and explains any problem in an alert.)
HERE="$(cd "$(dirname "$0")/../Resources" && pwd)"
exec "$HERE/node/node" "$HERE/launcher.cjs" "$@"
