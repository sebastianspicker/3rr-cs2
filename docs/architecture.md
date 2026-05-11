# Architecture

`cs2-server-ops` is one product with three module boundaries:

- `provision`: bootstrap a server runtime and supporting assets
- `maintain`: keep an existing server updated safely
- `operate`: control and monitor running servers

## Module Relationships

```mermaid
flowchart LR
    P["provision\nbootstrap assets\nenv templates\nplugin/admin seeds"]
    M["maintain\nupdater script\nsystemd timer"]
    O["operate\npanel\nRCON control plane"]

    P -- "generates admin/plugin files\nconsume env template" --> M
    P -- "generates admin/plugin files\nconsume env template" --> O
    M -- "separate lifecycle\nno runtime dependency" --> O
```

## Runtime Flow

1. `provision` creates files an operator can copy into a CS2 runtime.
2. `maintain` reads its own config, compares local and remote Steam build IDs, and only stops
   the service when a real update is known to be required.
3. `operate` keeps users, server inventory, access grants, and last-known game state in SQLite.
   It connects to CS2 servers over RCON and does not run SteamCMD or shell into hosts.

The root docs and env examples are the shared contract between modules. Runtime code stays inside
its module boundary.

## Why The Split Exists

Operators think in lifecycle stages, but the implementation still needs clear seams:

- bootstrap assets should not drag in a web app
- the updater should remain usable on a plain host
- the panel should not become a host orchestration daemon

## Historical Notes

Import and migration notes are archived under `docs/archive/migration/`.

## Explicit Exclusions

- archived audit workspaces
- local temp data, DB state, screenshots from ad-hoc verification, and generated bundles
- Pterodactyl-first runtime packaging as the default deployment path

## Publication Intent

This repo is intended to publish with `dev` as the authoritative branch.
