#!/usr/bin/env bash
# Builds the SPA with the /agent-builder/ base and stages it into this extension's
# wwwroot/, which the csproj copies into the build output and the gateway CLI then
# deploys to ~/.botnexus/extensions/botnexus-agent-builder/wwwroot/.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

cd "$repo"
npm run build -- --base=/agent-builder/

rm -rf "$here/wwwroot"
mkdir -p "$here/wwwroot"
cp -R "$repo/dist/." "$here/wwwroot/"

echo "Staged SPA into $here/wwwroot"
