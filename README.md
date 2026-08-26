# BotNexus Agent Builder

A standalone single-page web app that generates **BotNexus gateway agents**. Pick
a persona to seed an agent's personality, set its model, tools, and coordination,
then download a ready-to-install bundle:

```
agents/<id>/SOUL.md          # personality, values, communication, boundaries
agents/<id>/IDENTITY.md      # name, role, expertise, how to address
agents/<id>/AGENTS.md        # peer agents, coordination, memory notes
agents/<id>/TOOLS.md         # per-tool usage guidance
agents/<id>/WORLD.md         # (optional) environment context
agents/<id>/USER.md          # (optional) user preferences
config.snippet.json          # the config.json → agents → <id> entry
INSTALL.md                   # install steps
```

This is a **generator only** — it never writes to a gateway. You download the
bundle and install it yourself. It is derived from the Agent Builder in
[ContextForge](https://github.com/bradbor23) and kept in parallel so it can later
be served inside the BotNexus plugin platform.

## Develop

```bash
npm install
npm run dev      # http://localhost:5183
```

## Build

```bash
npm run build    # tsc --noEmit && vite build → dist/
npm run preview
```

The build uses a relative `base` (`./`), so `dist/` can be served from any path —
a static host, or a BotNexus `endpoint-contributor` mounting it under a subpath.

## Install a generated agent onto a gateway

1. Copy `agents/<id>/` to `~/.botnexus/agents/<id>/` on the gateway.
2. Merge `config.snippet.json` into `~/.botnexus/config.json` under the top-level
   `agents` key (keep your existing agents).
3. Restart the gateway and confirm the agent appears in `GET /api/agents`.

`workspace/`, `data/`, and `memory` are created automatically at first run.

## Layout

```
src/
  lib/
    persona/         # persona specs + soul/identity seeding (vendored from ContextForge)
    agent-builder/   # BotNexus agent schema, file renderers, config-snippet serializer
    providers.ts     # LLM providers + suggested models
    download.ts      # clipboard + .zip bundle (fflate)
  components/
    AgentBuilderWizard.tsx
    WizardHelp.tsx
  App.tsx
  App.css
```
