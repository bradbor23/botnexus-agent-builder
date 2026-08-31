#!/usr/bin/env python3
"""Check this repo against the rules PluginExtensionDeployer applies at install time.

Mirrors src/extensions/BotNexus.Extensions.Plugins/Lifecycle/PluginExtensionDeployer.cs, so a
packaging mistake surfaces here rather than as a rejected install on the gateway. Exits non-zero
if any check fails.

    ./scripts/preflight-plugin.py
"""
import json, os, re, sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
checks = []


def chk(name, ok, detail=""):
    checks.append((bool(ok), name, detail))
    return bool(ok)


try:
    plugin = json.load(open(os.path.join(root, ".botnexus-plugin", "plugin.json")))
except (OSError, json.JSONDecodeError) as e:
    print(f"  [FAIL] .botnexus-plugin/plugin.json is readable JSON — {e}")
    sys.exit(1)

ref = plugin.get("extension", {}).get("manifest", "")
if not chk("extension.manifest is declared", ref.strip()):
    print("  (skills-only plugin: nothing further to check)")
    sys.exit(0)

mpath = os.path.abspath(os.path.join(root, ref))
chk("manifest path resolves inside the plugin directory", mpath.startswith(root + os.sep))

if not chk("manifest file exists", os.path.isfile(mpath), ref):
    for ok, name, detail in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    sys.exit(1)

try:
    man = json.load(open(mpath))
except json.JSONDecodeError as e:
    chk("manifest is valid JSON", False, str(e))
    man = {}

src = os.path.dirname(mpath)
chk("manifest declares 'id'", man.get("id", "").strip())
chk("'id' is a safe directory segment",
    re.fullmatch(r"[A-Za-z0-9._-]+", man.get("id", "") or "") and man.get("id") not in (".", ".."))
chk("manifest declares 'entryAssembly'", man.get("entryAssembly", "").strip())

entry = os.path.abspath(os.path.join(src, man.get("entryAssembly", "") or "."))
chk("entry assembly is present (a carried extension must be PREBUILT)",
    entry.startswith(src + os.sep) and os.path.isfile(entry),
    "" if os.path.isfile(entry) else f"missing {man.get('entryAssembly')} — see PACKAGING.md")

# Third-party code must not map ahead of the gateway's authentication.
phase = (man.get("endpointPhase") or "").replace("-", "").lower()
chk('endpointPhase is "after-authentication"', phase == "afterauthentication",
    "" if phase == "afterauthentication" else f"got {man.get('endpointPhase')!r}")

for ok, name, detail in checks:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

passed = sum(1 for ok, _, _ in checks if ok)
print(f"\n{passed}/{len(checks)} deployer checks pass")
sys.exit(0 if passed == len(checks) else 1)
