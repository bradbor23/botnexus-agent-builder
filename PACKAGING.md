# Packaging this repo as a BotNexus plugin

This repo is both the **source** of the Agent Builder and the **plugin** the marketplace
installs from. That dual role is what makes the layout look odd, so this file explains it.

## Why build output is committed

`GitPluginSourceFetcher` installs a plugin by running, literally:

```
git clone --quiet [--branch <reference>] -- <source> .
```

There is **no build step** and no guaranteed SDK on the host. `PluginLifecycleManager.Promote`
then copies everything except `.git/` into `~/.botnexus/plugins/<name>/`. So anything the
gateway needs at install time has to already be in git.

Hence `extension/` — the deploy payload — is generated *and committed*:

```
extension/
  botnexus-extension.json                 # generated copy of the canonical manifest
  BotNexus.Extensions.AgentBuilder.dll     # prebuilt entry assembly
  wwwroot/                                 # SPA built with --base=/agent-builder/
```

**Do not hand-edit `extension/`.** Edit the source and re-run `./scripts/pack-plugin.sh`.

`PluginExtensionDeployer` copies *the directory containing the manifest* into
`~/.botnexus/extensions/<id>/`. That is why the payload lives in its own directory rather than
at the repo root — a root manifest would drag `src/`, `node_modules/` and `package.json` into
the extensions tree.

Only the entry assembly ships. `BotNexus.Gateway.Abstractions`, `BotNexus.Gateway.Configuration`
and the framework are resolved from the **host** by the loader's ALC; shipping our own copies is
how a binary plugin breaks on a gateway a patch release away.

## Building the DLL

The extension **cannot be built from this repo alone**, by design:

- its `.csproj` declares no `TargetFramework` — it inherits `net10.0` from the gateway's
  `Directory.Build.props`;
- its `ProjectReference`s point at `..\..\gateway\...`, which resolves only when the project
  sits at `src/extensions/BotNexus.Extensions.AgentBuilder/` inside a gateway checkout.

The gateway also sets `TreatWarningsAsErrors`, so it must compile warning-clean.

From a gateway checkout (`$GW`) and this repo (`$PL`):

```bash
# 1. Sync the source in. The gateway's vendored copy lags behind this repo.
cp "$PL"/gateway-extension/BotNexus.Extensions.AgentBuilder/*.cs \
   "$PL"/gateway-extension/BotNexus.Extensions.AgentBuilder/*.csproj \
   "$PL"/gateway-extension/BotNexus.Extensions.AgentBuilder/botnexus-extension.json \
   "$GW"/src/extensions/BotNexus.Extensions.AgentBuilder/

# 2. Build.
dotnet build "$GW"/src/extensions/BotNexus.Extensions.AgentBuilder/BotNexus.Extensions.AgentBuilder.csproj -c Release

# 3. Assemble the payload (also rebuilds the SPA).
"$PL"/scripts/pack-plugin.sh --dotnet-out \
  "$GW"/src/extensions/BotNexus.Extensions.AgentBuilder/bin/Release/net10.0

# 4. Commit the payload.
cd "$PL" && git add extension && git commit -m "chore: rebuild plugin payload"
```

Until step 2 has run at least once, the install is refused up front with
`names entry assembly '...', which is not present in the plugin` — the deployer checks for the
binary at install rather than letting it fail at the next gateway start.

## The manifest fields that are not optional

`extension/botnexus-extension.json` is generated from
`gateway-extension/BotNexus.Extensions.AgentBuilder/botnexus-extension.json`, which is the one
to edit. Three fields exist specifically for the plugin path:

- **`endpointPhase: "after-authentication"` — mandatory.** `PluginExtensionDeployer` refuses any
  carried extension without it, so third-party code cannot map ahead of the gateway's
  authentication by saying nothing. Note this also puts `/agent-builder/` behind auth on the
  source-built path, which is the intent: it writes agent files.
- **`compatibility`** — the ABI gate, checked against the **`BotNexus.Gateway.Abstractions`
  assembly version** before the assembly loads. Currently `>= 0.45.0` and `< 0.46.0` (the upper
  bound is exclusive). A prebuilt binary is bound to the Abstractions it compiled against, so
  widen this only after rebuilding and testing against the newer gateway.
- **`nav`** — the portal's left-nav entry. It lives on the *extension* manifest, not the plugin
  manifest, so a source-built extension gets nav on the same terms as a plugin-delivered one.
  `icon` must be a key in the portal's `IconLibrary` (`agents` here); an unknown name silently
  falls back to `plugins` rather than failing.

## Updating an installed copy

`PluginExtensionDeployer` **refuses to overwrite an existing extension directory**. The running
gateway has the extension's assemblies loaded, and replacing them in place fails with
`IOException: ... because it is being used by another process`. The staged-swap that would fix
this is not built yet.

So updating is not an in-place operation:

1. Uninstall the plugin (`DELETE /api/plugins/{name}`).
2. Remove `~/.botnexus/extensions/botnexus-agent-builder/`.
3. Restart the gateway.
4. Install again.

Installing a **new** id is safe from inside the running gateway; replacing one is not.
Either way, activation needs a restart — `MapExtensionEndpoints` runs once at startup and there
is no hot-map path. Skills stay hot; code does not.
