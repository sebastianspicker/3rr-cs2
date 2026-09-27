# Preparing a CS2 server for the panel

## In short

The panel (control plane) connects to a CS2 server **you already run**, over RCON. It installs
nothing on that server. **A control in the panel only works if the CFG file, map, or plugin
behind it is already installed on that server.**

Before a control is available to operators:

1. install what it needs;
2. prove that it works over RCON;
3. make sure RCON is reachable only from the panel.

## Install the CFG files

1. Copy the configuration files you need from
   [`server-bootstrap/assets/cfg/`](../../server-bootstrap/assets/cfg/) into the server's
   `game/csgo/cfg` folder.
2. The available files are listed, and checked, in
   [`server-bootstrap/capabilities.json`](../../server-bootstrap/capabilities.json). The
   capability contract keeps that manifest synchronized with the startup wrapper's shipped
   bundle.
3. **MatchZy live-match controls** run `live.cfg`. You can use
   `server-bootstrap/assets/cfg/server-provided/live.cfg` as the source and install it at
   `game/csgo/cfg/live.cfg`, or provide an equivalent file there.
4. Test each preset you enable over RCON, for example:

   ```text
   exec warmup.cfg
   exec live.cfg
   ```

## Install plugins and maps, then prove they work

Some controls need Metamod, CounterStrikeSharp, MatchZy, or a plugin for a specific game mode.
A CFG file sets server rules; it does **not** install plugins or maps.

These modes all need server-side support that the panel does not install:

- CTF
- deathrun
- OITC
- 1v1 arenas
- Roll the Dice
- MatchZy

Before you make a control available to operators:

1. Install the required plugin or map on the server.
2. Run `css_plugins list` and confirm the plugin loaded.
3. Run the matching CFG file or command over RCON.
4. Check the result on the server itself.

## Lock down RCON

- Give RCON its own password.
- Allow the RCON port **only from the panel's host**. Never expose it publicly.
- Before you add the server to the panel, confirm that RCON login works from the panel's
  network.

## Checklist before enabling a control

- [ ] The CFG file is in `game/csgo/cfg` and listed in `capabilities.json`.
- [ ] Any required plugin is installed and shows up in `css_plugins list`.
- [ ] Any required map is installed.
- [ ] The CFG file or command ran over RCON, and you checked the result on the server.
- [ ] RCON has its own password and is reachable only from the panel's host.
- [ ] RCON login works from the panel's network.

For how the panel reports results, including why some settings show as _Not reported_, see
the [README screenshot tour](../../README.md#screenshot-tour).

## Glossary

- **CFG file**: a text file of CS2 console commands, run with `exec`.
- **`capabilities.json`**: the manifest listing which CFG files 3RR ships and supports.
- **CounterStrikeSharp**: a plugin framework for CS2; `css_plugins list` is its command for
  listing loaded plugins.
- **MatchZy**: a CS2 plugin that runs competitive matches.
- **Metamod**: a loader that other CS2 server plugins run on.
- **Panel (control plane)**: 3RR's web application.
- **RCON**: the password-protected remote-console protocol for game servers.
- **Startup wrapper**: 3RR's script that builds the CS2 startup command.
