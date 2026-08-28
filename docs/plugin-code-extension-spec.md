# Spec: extending the plugin format to carry code/UI extensions

**Status:** proposal for design · **Consumer:** the Agent Builder extension (a live, working
`IEndpointContributor` serving a SPA at `/agent-builder`) · **Audience:** whoever builds the
plugin marketplace + format.

Every requirement below is tied to how the gateway code actually behaves today; the source
files are listed in §9 so this can be verified rather than trusted.

---

## 1. Purpose

Today a **plugin** (git repo, marketplace-installed, `.botnexus-plugin/plugin.json`) can carry
**skills only** — `additionalProperties: false` on the schema means the author literally cannot
declare code, and nothing in the gateway loads code from a plugin dir. Runnable code/UI ships
only as a **gateway extension** (`botnexus-extension.json` + an assembly loaded by
`AssemblyLoadContextExtensionLoader`), which has **no marketplace distribution path** — it's
built from source via `serve gateway`.

Agent Builder is squarely a code/UI extension and cannot be expressed as a skill. This spec
defines what the plugin format + gateway must add so a marketplace plugin can **carry, install,
and integrate a code/UI extension as a clean drop-in** — no hand-patching of the portal.

## 2. Current state — two disjoint mechanisms

| | Plugin | Extension |
|---|---|---|
| Manifest | `.botnexus-plugin/plugin.json` (schema `additionalProperties: false`) | `botnexus-extension.json` |
| Install | `git clone` → validate → promote to `~/.botnexus/plugins/<name>/` | built from `src/extensions/**`, deployed to `~/.botnexus/extensions/<id>/` |
| Distributes via marketplace? | **Yes** | **No** |
| Can ship code/UI? | **No** | **Yes** (`IEndpointContributor`, `IAgentTool`, …) |
| Discovered content | skills only (`PluginSkillRootResolver`) | all contracts in the loader's discovery list |

The gap this spec closes: **let a plugin carry an extension**, deploy it through the existing
extension loader, and — critically — give a UI extension the two integration points it needs
without editing gateway/portal source.

## 3. The consumer's concrete needs (why "ship an assembly" is not enough)

Agent Builder is the reference consumer. Shipping it required **three** things, only one of
which is "carry a DLL". The other two are currently edits to the **portal's** source (see the
two commits on the gateway repo's `feat/portal-icons-batch2`):

1. **Carry + load the extension** — the `IEndpointContributor` DLL + its `wwwroot/` SPA build.
2. **Claim a served path** — a one-line addition to the SignalR portal's passthrough allowlist,
   because the portal's catch-all middleware serves the Blazor app for any path not explicitly
   excluded, and endpoint-contributor middleware order is **nondeterministic**.
3. **Contribute a nav entry** — an edit to `MainLayout.razor`, because the sidebar is a
   hardcoded key list; the NavOrder API only *reorders* known keys, it can't *add* one.

A plugin cannot patch another extension's source, so a code-carrying format that only does (1)
still leaves (2) and (3) as manual portal patches. **The format must cover all three** or UI
extensions aren't drop-ins. §4.3 and §4.4 generalize (2) and (3) into gateway features.

## 4. Proposal

### 4.1 Carry code — plugin manifest `extension` field

Plugins are copied **verbatim** (no build step at install; `GitPluginSourceFetcher` clones,
`PluginLifecycleManager.Promote` copies everything but `.git/`). So a carried extension must be
**prebuilt** and committed to the plugin repo.

Add one optional object to `plugin-manifest.schema.json` (it must be added explicitly — the
schema is `additionalProperties: false`):

```jsonc
"extension": {
  "manifest": "botnexus-extension.json",   // path within the repo to the extension manifest
  "abi": "^1.4.0"                            // gateway ABI range this binary was built for (see §4.5)
}
```

The referenced `botnexus-extension.json` is the **existing** extension manifest, unchanged in
shape (`id`, `name`, `version`, `entryAssembly`, `extensionTypes`, …). The plugin repo ships the
entry assembly, its non-framework/-contract dependencies, and any static assets (`wwwroot/`).

Recommended plugin repo layout:

```
.botnexus-plugin/plugin.json      # name/description/keywords + the new "extension" object
botnexus-extension.json           # the extension manifest
lib/                              # prebuilt entry DLL (+ private deps; NOT shared contracts)
wwwroot/                          # built static assets, if the extension serves UI
skills/                           # optional; skills still work alongside
```

> Trim shared/contract assemblies (`BotNexus.Gateway.Abstractions`, `BotNexus.Domain`, …) out of
> `lib/` — the ALC resolves those from the host. Shipping mismatched copies is how a binary
> plugin breaks on a slightly different gateway. See §4.5.

### 4.2 Install / deploy / lifecycle

Reuse the existing extension loader — don't write a second one.

- **Deploy step:** on promote, after copying the plugin into `~/.botnexus/plugins/<name>/`, copy
  the carried extension subtree into `~/.botnexus/extensions/<id>/` (mirroring
  `ServeCommand.DeployExtensions`, which already copies a build output tree recursively and
  prunes stale files with locked-file tolerance). Then `AssemblyLoadContextExtensionLoader` picks
  it up unchanged.
- **Provenance:** record `plugin <name> → extension <id>` so uninstall removes the deployed
  extension, not just the plugin dir. (The plugin record already stores the commit SHA; add the
  deployed extension id.)
- **Activation requires a restart.** Endpoint contributors are wired during app startup —
  `MapEndpoints(WebApplication)` is called once, post-build, in a loop over
  `GetServices<IEndpointContributor>()`. There is no hot-map path today. The spec should state
  plainly: **installing/removing a code plugin needs a gateway restart to take effect.** (A
  hot-reload story is a separate, larger effort; skills can stay hot.)
- **Uninstall:** remove `~/.botnexus/plugins/<name>/` **and** the provenance-linked
  `~/.botnexus/extensions/<id>/`; unload happens on next start (the ALC is collectible).
- **Update:** replace DLL + assets; reuse the stale-file prune (Blazor/Vite fingerprint assets,
  so names change every build and old generations must be swept).

### 4.3 Path claiming — make the portal a deterministic fallback

**Problem (verified):** `SignalREndpointContributor` registers an `app.Use` catch-all that
serves the Blazor portal for any path not in a hardcoded allowlist (`/api`, `/hub`, `/swagger`,
`/health`, `/mobile`). Contributors run in `GetServices<IEndpointContributor>()` order =
registration = extension **load order**, which `LoadConfiguredExtensionsAsync` derives from a
topological sort whose tie-break is filesystem directory order — **nondeterministic**. So a UI
extension's route may or may not win. My patch hardcoded `/agent-builder` into the allowlist;
that doesn't generalize to arbitrary plugins.

**Proposed fix — ordering, not an allowlist.** Give endpoint contributors an explicit order and
make the portal the last-resort:

- Add an ordering signal to `IEndpointContributor` — e.g. an `int Order { get; }` (default 0) or
  a marker interface `IFallbackEndpointContributor`.
- The invocation loop sorts by it before calling `MapEndpoints`. The portal declares itself the
  fallback (highest order / runs last, or implements the marker).
- Result: every other contributor's middleware registers **before** the portal's catch-all, so a
  UI extension that maps `/agent-builder` short-circuits it deterministically. The portal's
  catch-all only ever sees paths nobody claimed. **No allowlist, no per-path patch, no registry.**

This removes patch (2) entirely and fixes it for all future UI extensions. (An equivalent but
more explicit alternative: a gateway path-claim registry the portal consults — populated from a
`uiPaths: ["/agent-builder"]` manifest field. Ordering is simpler and needs no new manifest
surface; recommended.)

### 4.4 Nav contribution — declarative sidebar entries

**Problem (verified):** the portal sidebar is `NavOrderKeys.DefaultOrder` — a hardcoded static
list in `MainLayout.razor`. `OrderedNavKeys()` merges server-provided *order* over that list,
and `NavOrderController`/`NavOrderApiClient` persist *ordering of known keys*. There is no way to
*add* a key without editing the Blazor client. My nav link was a hand-written
`RenderAgentBuilderNav()` fragment.

**Proposed fix — contributed nav items the portal renders at runtime:**

- Declare nav entries in a manifest (extension or plugin):
  ```jsonc
  "nav": [
    { "id": "agent-builder", "label": "Agent Builder", "path": "/agent-builder",
      "icon": "tools", "order": 65, "external": true }
  ]
  ```
- Expose contributed entries via an API the portal already-ish has a home for (extend the
  NavOrder surface, or add `GET /api/nav/contributions`). The Blazor client fetches them on load
  and merges into `OrderedNavKeys()`/render alongside the built-ins.
- Generalize the render path: a contributed entry with `external: true` (a path served by an
  extension, not a Blazor `@page`) must render as a **forceLoad** navigation — this is exactly
  what `RenderAgentBuilderNav` does (`Nav.NavigateTo(path, forceLoad: true)`); productize it so a
  plain internal `<NavLink>` is used for Blazor routes and a forceLoad anchor for external ones.
- **Icon story (call-out):** the `Icon` component is a fixed named set. Either (a) constrain
  `icon` to that enum, or (b) allow an inline SVG / data URI in the contribution. Pick one — a
  fixed enum is safer for a marketplace (no arbitrary SVG injection into the portal DOM).

This removes patch (3) and makes nav declarative for every plugin.

### 4.5 ABI / version compatibility

A prebuilt extension DLL is bound to the `BotNexus.Gateway.Abstractions` it compiled against.
There is **no compat field today** — a mismatched binary would fail (or worse, load with a
subtly different contract) at startup. The loader already validates `Dependencies` and prunes
un-activatable services (#2220); add a version gate alongside it:

- Declare a supported gateway/ABI range on the extension manifest (or the plugin's `extension.abi`
  in §4.1) — e.g. `minGatewayVersion`/`maxGatewayVersion`, or an Abstractions assembly-version
  range.
- The loader checks it **before** loading the assembly and **refuses with a clear message**
  ("built for gateway ABI ^1.4.0; this gateway is 1.6.0") instead of crashing host startup.
- Marketplace-side: surface compatibility on the listing so an operator sees it before install.

(Longer-term alternative: source plugins built on install. But plugins are copy-verbatim with no
build step and no guaranteed SDK on the host, so prebuilt + a version guard is the pragmatic
primary path.)

### 4.6 Security & trust — code runs in-process

This is the biggest change in posture. A skill is a prompt; a code plugin **runs a .NET assembly
in the gateway process** (collectible ALC, but full trust, no sandbox). The format/marketplace
must treat code plugins differently from skills-only ones:

- **Explicit consent:** installing a code plugin must require an operator confirmation distinct
  from skills ("this plugin runs code in your gateway"). Skills-only installs stay low-friction.
- **Capability disclosure:** the install UI should show what the extension contributes
  (`extensionTypes`, served paths, nav entries, tools) — derived from the manifest — before the
  operator commits.
- **Provenance/pinning:** the plugin system already records the install commit SHA; for code,
  prefer installing a pinned tag/commit and consider assembly signing.
- **Isolation reality:** document that an `IAgentTool` that runs bash and a UI `IEndpointContributor`
  are both in-process/full-trust; there is no per-extension sandbox. This informs the trust model.

## 5. Worked example — the Agent Builder plugin

What the repo would look like once §4 lands (no portal patches needed):

```
.botnexus-plugin/plugin.json
botnexus-extension.json
lib/BotNexus.Extensions.AgentBuilder.dll
wwwroot/                 # the built SPA (index.html + assets, base=/agent-builder/)
```

`.botnexus-plugin/plugin.json`:

```json
{
  "name": "agent-builder",
  "description": "Persona-seeded generator for BotNexus agents (SOUL/IDENTITY/AGENTS/TOOLS + config), served in-portal.",
  "version": "1.0.0",
  "author": { "name": "..." },
  "license": "MIT",
  "keywords": ["agents", "generator", "ui"],
  "extension": { "manifest": "botnexus-extension.json", "abi": "^<gateway-abi>" },
  "nav": [
    { "id": "agent-builder", "label": "Agent Builder", "path": "/agent-builder",
      "icon": "tools", "order": 65, "external": true }
  ]
}
```

Install flow: marketplace → `git clone` → validate manifest → promote plugin files → deploy
`botnexus-extension.json`+`lib/`+`wwwroot/` into `~/.botnexus/extensions/agent-builder/` →
restart → the ordering fix (§4.3) lets it serve `/agent-builder`, the nav contribution (§4.4)
shows the sidebar entry. Zero source edits.

## 6. Minimal viable build order

1. **Carry + deploy a prebuilt extension** from a plugin (schema `extension` field; deploy step
   reusing `DeployExtensions`; provenance; restart-to-activate). — Makes code shippable at all.
2. **Endpoint-contributor ordering / portal-as-fallback** (§4.3). — Removes the passthrough patch;
   makes UI serving self-contained and deterministic.
3. **Nav contribution API** (§4.4). — Removes the `MainLayout` patch.
4. **ABI/version guard + code-plugin consent** (§4.5, §4.6). — Safety before this is public.

Items 2 and 3 are the "two extension points"; 1 is the carrier; 4 is the guardrail. Agent Builder
can ship as a marketplace plugin the moment 1–3 exist (4 before it's opened to third parties).

## 7. What Agent Builder guarantees the format designer

- It's a **pure UI endpoint-contributor** (no `IAgentTool`, no bash) — the lowest-risk shape of
  code to pilot the carrier with.
- It already runs as a normal extension, so items 2–3 can be validated against a real consumer:
  land the ordering fix and the nav API, delete my two portal patches, and confirm it still
  serves + shows in nav. That's a concrete acceptance test for the extension points.

## 8. Open questions for the format designer

- **Ordering vs registry** for path-claim (§4.3) — recommend ordering; confirm the portal can
  declare itself fallback cleanly.
- **Icon model** for nav contributions (§4.4) — fixed enum vs inline SVG.
- **Restart vs hot-load** — is restart-to-activate acceptable for v1? (Recommended yes.)
- **ABI expression** — assembly-version range vs a coarse `minGatewayVersion`.
- **Do plugins and extensions stay separate installs**, with plugins able to *carry* an
  extension, or do they converge? (This spec assumes carry, reusing the extension loader.)

## 9. Source files (verify, don't trust)

Plugin format & lifecycle:
- `src/extensions/BotNexus.Extensions.Plugins/Schemas/plugin-manifest.schema.json`
- `src/extensions/BotNexus.Extensions.Plugins/PluginManifestParser.cs`
- `src/extensions/BotNexus.Extensions.Plugins/Lifecycle/GitPluginSourceFetcher.cs`
- `src/extensions/BotNexus.Extensions.Plugins/Lifecycle/PluginLifecycleManager.cs`
- `src/extensions/BotNexus.Extensions.Plugins/Lifecycle/PluginSkillRootResolver.cs`

Extension loading & deploy:
- `src/gateway/BotNexus.Gateway.Abstractions/Extensions/IEndpointContributor.cs`
- `src/gateway/BotNexus.Gateway/Extensions/AssemblyLoadContextExtensionLoader.cs` (discovery list,
  `MapEndpoints` loop, `ValidateDependencies`, prune pass)
- `src/gateway/BotNexus.Gateway/Extensions/ServiceCollectionExtensions.cs` (`LoadConfiguredExtensionsAsync`, `TopologicallySort`)
- `src/gateway/BotNexus.Cli/Commands/ServeCommand.cs` (`DeployExtensionsSilent` — the copy/prune)
- `src/gateway/BotNexus.Gateway.Api/Program.cs` (contributor invocation phase, `UseCors`)

Portal (the two integration points):
- `src/extensions/BotNexus.Extensions.Channels.SignalR/SignalREndpointContributor.cs` (catch-all + passthrough)
- `src/extensions/BotNexus.Extensions.Channels.SignalR.BlazorClient/Layout/MainLayout.razor` (`NavOrderKeys`, `OrderedNavKeys`, `RenderNavSection`)
- `src/gateway/BotNexus.Gateway.Api/Controllers/NavOrderController.cs` + `.../BlazorClient.Core/Services/NavOrderApiClient.cs`
