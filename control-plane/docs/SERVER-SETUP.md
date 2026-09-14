# CS2 server requirements

The control plane connects to an existing CS2 server over RCON. Each control
depends on the corresponding configuration file, map, or plugin already being
installed on that server.

## CFG assets

Copy the configuration files you need from
`../../server-bootstrap/assets/cfg/` into the server's `game/csgo/cfg`
directory. The available files are listed and checked by
[`../../server-bootstrap/capabilities.json`](../../server-bootstrap/capabilities.json).
The startup wrapper only accepts paths listed in that manifest.

The MatchZy live-match controls run `live.cfg`. You can use
`../../server-bootstrap/assets/cfg/server-provided/live.cfg` as the source,
installing it at `game/csgo/cfg/live.cfg` on the server, or provide an
equivalent file there.

Verify each enabled preset through RCON, for example:

```text
exec warmup.cfg
exec live.cfg
```

## Plugins and maps

Some controls require Metamod, CounterStrikeSharp, MatchZy, or a plugin for a
specific game mode. Configuration files set server rules; they do not install
plugins or maps.

Before making a control available to operators:

1. Install the required plugin or map on the server.
2. Run `css_plugins list` and confirm the plugin loaded.
3. Execute the corresponding CFG or command over RCON.
4. Check the result on the server itself.

CTF, deathrun, OITC, 1v1 arenas, Roll the Dice, and MatchZy all need
server-side support that the control plane does not install.

## Network access

Give RCON its own password and restrict the RCON port to the control-plane
host. Do not expose the port publicly. Before adding a server, confirm that
RCON authentication works from the control-plane network.
