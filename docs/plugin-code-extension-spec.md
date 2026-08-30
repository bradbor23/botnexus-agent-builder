# Plugin code/UI extensions — where the spec now lives

This file used to hold a **design proposal** for extending the BotNexus plugin format so a
plugin could carry a compiled extension and its UI. That proposal was written from this repo,
because the Agent Builder was the consumer that needed it.

**It has since been implemented, and the proposal was wrong in places.** Keeping a copy here
only guarantees it drifts from the gateway that actually enforces the rules, so the copy is
gone rather than refreshed.

## Read instead

- **`docs/development/plugin-code-extension-spec.md`** in the gateway repo — the canonical spec.
  It keeps the original proposal but annotates it with `[correction]` sections marking where the
  design changed once it met the code. Worth reading for the reasoning.
- **`docs/development/plugin-repository-requirements.md`** in the gateway repo — what a plugin
  repository must contain, checked against the code that reads it.
- **[PACKAGING.md](../PACKAGING.md)** in this repo — the practical version for *this* plugin:
  how the payload is assembled, why build output is committed, and how to rebuild it.

## The short version

A plugin carries an extension by adding one object to `.botnexus-plugin/plugin.json`:

```jsonc
"extension": { "manifest": "extension/botnexus-extension.json" }
```

The three things the proposal did not get right, and which cost the most time to rediscover:

1. **The extension must be prebuilt and committed.** Plugins are cloned verbatim with no build
   step, so the entry assembly ships in git.
2. **`endpointPhase: "after-authentication"` is mandatory** on the carried extension manifest.
   The installer refuses a carried extension without it — third-party code must not map ahead of
   the gateway's authentication by staying silent.
3. **A deployed extension is never overwritten in place.** The running gateway holds its
   assemblies open, so updating means uninstall, remove, restart, install.
