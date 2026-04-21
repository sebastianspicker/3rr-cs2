# Migration Ledger

Snapshot date: 2026-04-12

| Source | Artifact group | Target | Action | Notes |
| --- | --- | --- | --- | --- |
| `02_mid_cs2-modded-server-panel` | app code, routes, views, config, tests | `apps/operate/panel` | move and adapt | Kept as a self-contained Node module with public-facing docs and stripped standalone repo metadata |
| `02_mid_cs2-modded-server-panel` | `node_modules`, `dist`, DB files, temp directories, audit workspaces | excluded | exclude | Not publishable source material |
| `02_mid_cs2-modded-server-panel` | Pterodactyl installer and egg-specific docs/helpers | excluded | exclude | Migration concern only; not part of the default repo story |
| `03_low_cs2-auto-update` | script, tests, shell tooling | `apps/maintain/updater` | move as-is | Preserved as a script-first module |
| `03_low_cs2-auto-update` | repo-local audit report and log output | excluded | exclude | Local artifacts only |
| `99_archived_cs2-modded-server-egg` | startup and bootstrap concepts | `apps/provision/bootstrap`, `configs/examples`, `docs/workflows` | move and rewrite | Re-expressed as generic bootstrap assets without reviving the archived runtime model |
| `99_archived_cs2-modded-server-egg` | egg JSON, archived runtime packaging, stale platform assumptions | excluded | exclude | Explicitly not the umbrella’s default path |
