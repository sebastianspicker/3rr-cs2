# Server Setup

This document covers the runtime prerequisites that must exist on the CS2 server side for the panel’s controls to work.

## CFG Files

The panel expects the mode CFG files from `cfg/` to be available in the game server’s `game/csgo/cfg/` directory.

Important examples:

- `warmup.cfg`
- `knife.cfg`
- `wingman.cfg`
- `live_wingman.cfg`
- `bhop.cfg`
- `ctf.cfg`
- `deathmatch.cfg`
- `deathrun.cfg`
- `gungame.cfg`
- `scoutzknivez.cfg`
- `surf.cfg`
- `random_rounds_on.cfg`
- `random_rounds_off.cfg`
- `rtd_on.cfg`
- `rtd_off.cfg`

Keep provider-specific upload mechanics outside this repo. The requirement is only that the files exist in the runtime config directory.

## Plugins

Some game modes depend on CounterStrikeSharp plugins. Install the required plugins in the server runtime before exposing those controls through the panel.

Recommended checks:

- Metamod:Source is installed
- CounterStrikeSharp is installed
- each plugin required by the selected mode is installed
- `css_plugins list` confirms the plugin loaded successfully

## Operational Rule

Panel actions should only expose controls that the underlying server runtime actually supports. If a plugin or CFG is missing, fix the server runtime first instead of patching the panel around it.
