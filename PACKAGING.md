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

### Why not a root manifest, when the reference layout uses one

Both placements are valid, and which is right follows from what the repository *is*:

- A **payload-only** repo — nothing in it but the built extension — keeps the manifest at the
  root. `.botnexus-plugin/`, `skills/` and `.git/` are excluded, so the root is already clean.
  The gateway host used to carry a hand-assembled `~/agent-builder-plugin` of this shape, which
  is why the platform docs show it that way. It has since been deleted — this repo is the only
  source now — so treat that as an illustration, not a place to look.
- **This repo is also the source** of the extension. Those three exclusions apply *only* when
  the manifest sits at the plugin root, so a root manifest here would deploy `src/`,
  `package.json` and `node_modules/` into the extensions tree.

Hence `extension/`.

### Only the entry assembly ships

`ExtensionAssemblyLoadContext.Load` unifies with the host **categorically**: any assembly the
gateway has loaded, ships in its base directory, or owns is resolved from the host's default
context, and the extension's private copy is never consulted. So `BotNexus.Gateway.Abstractions`,
`BotNexus.Gateway.Configuration`, `BotNexus.Domain` and the framework must not be shipped —
not because a copy would break the load, but because it is **dead weight** that misleads the
next reader into thinking the version in it matters.

`.deps.json` does travel with the entry assembly: `AssemblyDependencyResolver` reads it, and a
genuinely private dependency added later would need it.

> Evidence, from when this repo took over as the install source: the copy it replaced shipped
> eight such assemblies and served fine, which is the unification working. The payload installed
> now ships six files and none of those assemblies.

## Building the DLL

The extension **cannot be built from this repo alone**, by design:

- its `.csproj` declares no `TargetFramework` — it inherits `net10.0` from the gateway's
  `Directory.Build.props`;
- its `ProjectReference`s point at `..\..\gateway\...`, which resolves only when the project
  sits at `src/extensions/BotNexus.Extensions.AgentBuilder/` inside a gateway checkout.

The gateway also sets `TreatWarningsAsErrors`, so it must compile warning-clean.

The gateway repo no longer contains this project — it was removed in bradbor23/botnexus#25,
because a second copy under `src/extensions/` competes with the installed plugin for the same
deploy directory and wins by being older. So the build **creates the project directory, builds,
and deletes it again**. Step 4 is not optional: while that directory exists, a `botnexus build`
or `serve` will deploy it over the installed plugin.

From a gateway checkout (`$GW`) and this repo (`$PL`):

```bash
# 1. Place the source in the gateway tree. The directory does not exist there; make it.
EXT="$GW"/src/extensions/BotNexus.Extensions.AgentBuilder
mkdir -p "$EXT"
cp "$PL"/gateway-extension/BotNexus.Extensions.AgentBuilder/*.cs \
   "$PL"/gateway-extension/BotNexus.Extensions.AgentBuilder/*.csproj \
   "$PL"/gateway-extension/BotNexus.Extensions.AgentBuilder/botnexus-extension.json "$EXT"/

# 2. Build. Use the SDK that satisfies global.json — see the note below.
export DOTNET_ROOT="$HOME/.dotnet"; export PATH="$DOTNET_ROOT:$PATH"
dotnet build "$EXT"/BotNexus.Extensions.AgentBuilder.csproj -c Release

# 3. Assemble the payload (also rebuilds the SPA).
"$PL"/scripts/pack-plugin.sh --dotnet-out "$EXT"/bin/Release/net10.0

# 4. REMOVE the project again, and confirm nothing is left behind.
rm -rf "$EXT"
git -C "$GW" status --short          # expect no changes
find "$GW"/src/extensions -name '*.csproj' | grep AgentBuilder   # expect nothing

# 5. Commit the payload.
cd "$PL" && git add extension && git commit -m "chore: rebuild plugin payload"
```

**The SDK on `PATH` is probably the wrong one.** `global.json` pins 10.0.204 (feature band 2xx)
and `rollForward: latestMinor` only rolls *forward*, so a distro SDK from band 1xx can never
satisfy it — `dotnet build` fails with "A compatible .NET SDK was not found" naming the version
it wanted. The reference host keeps a satisfying SDK in `~/.dotnet`, hence the exports in step 2.
Do not "fix" this by editing `global.json`. Note also that a non-interactive `ssh host '...'`
does not source `~/.bashrc`, so a PATH export living there will not apply — set it inline.

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
  `icon` must be a key in the portal's `IconLibrary` (`tools` here); an unknown name silently
  falls back to `plugins` rather than failing.

  These values (`path: /agent-builder`, `icon: tools`, `order: 65`) were chosen to match the
  copy this repo replaced, so that taking over as the install source did not silently move or
  restyle an entry operators already used. They are now simply the live values. Change them
  deliberately or not at all.

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
