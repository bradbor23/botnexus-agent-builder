#!/usr/bin/env bash
# Assembles extension/ — the payload a marketplace install copies verbatim into
# ~/.botnexus/extensions/botnexus-agent-builder/.
#
# Everything under extension/ is GENERATED and COMMITTED. That is not an accident:
# GitPluginSourceFetcher clones a plugin repo with NO build step, so whatever the
# gateway needs at install time must already be in git. Do not hand-edit extension/;
# edit the source and re-run this script.
#
#   ./scripts/pack-plugin.sh --dotnet-out <dir>   full payload (SPA + manifest + DLL)
#   ./scripts/pack-plugin.sh                      SPA + manifest only; DLL left alone
#
# <dir> is the build output of BotNexus.Extensions.AgentBuilder, which only builds
# inside a gateway checkout — see PACKAGING.md for the exact command.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
src="$repo/gateway-extension/BotNexus.Extensions.AgentBuilder"
payload="$repo/extension"
entry_dll="BotNexus.Extensions.AgentBuilder.dll"

dotnet_out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dotnet-out) dotnet_out="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "error: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

mkdir -p "$payload"

# 1. The SPA. --base matters: the app is served under /agent-builder/, so Vite must
#    emit asset URLs relative to that prefix rather than to the site root.
echo "==> Building the SPA"
cd "$repo"
npm run build -- --base=/agent-builder/

echo "==> Staging wwwroot"
rm -rf "$payload/wwwroot"          # prune: Vite fingerprints filenames, so stale
mkdir -p "$payload/wwwroot"        # generations would otherwise pile up forever
cp -R "$repo/dist/." "$payload/wwwroot/"

# 2. The manifest. The copy under gateway-extension/ is the one to edit; this is a
#    generated duplicate so the payload directory is self-describing.
echo "==> Staging manifest"
cp "$src/botnexus-extension.json" "$payload/botnexus-extension.json"

# 3. The entry assembly. Only ever this one file: BotNexus.Gateway.Abstractions,
#    BotNexus.Gateway.Configuration and the framework are resolved from the HOST by
#    the loader's ALC. Shipping our own copies is exactly how a binary plugin breaks
#    on a gateway that is a patch release different.
if [ -n "$dotnet_out" ]; then
  if [ ! -f "$dotnet_out/$entry_dll" ]; then
    echo "error: $entry_dll not found in '$dotnet_out'" >&2
    exit 1
  fi
  echo "==> Staging $entry_dll"
  cp "$dotnet_out/$entry_dll" "$payload/$entry_dll"
else
  echo "==> Skipping the entry assembly (no --dotnet-out given)"
fi

echo
if [ -f "$payload/$entry_dll" ]; then
  echo "Payload complete: $payload"
else
  echo "Payload INCOMPLETE: $payload/$entry_dll is missing."
  echo "A marketplace install will be refused until it is built and committed:"
  echo "  \"names entry assembly '$entry_dll', which is not present in the plugin\""
fi
