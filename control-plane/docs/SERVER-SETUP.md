# CS2 server requirements

The control plane sends RCON commands to an existing CS2 server. Controls work
only when their required CFG files, maps, and plugins exist on that server.

## CFG assets

Copy required CFG files from `../../server-bootstrap/assets/cfg/` to the
server's `game/csgo/cfg` directory. The supported inventory is enforced by
[`../../server-bootstrap/capabilities.json`](../../server-bootstrap/capabilities.json).
Do not copy arbitrary bundle paths through the startup wrapper.

MatchZy live-match controls execute `live.cfg`. The reference file is
`../../server-bootstrap/assets/cfg/server-provided/live.cfg`; install it as the
server-local `game/csgo/cfg/live.cfg` or provide an equivalent file.

Verify each enabled preset through RCON, for example:

```text
exec warmup.cfg
exec live.cfg
```

## Plugins and maps

Several controls assume Metamod, CounterStrikeSharp, MatchZy, or a mode-specific
plugin. CFG files configure rules; they do not install plugin or map behavior.

Before exposing a control to operators:

1. Install the required plugin or map on the server.
2. Run `css_plugins list` and confirm the plugin loaded.
3. Execute the corresponding CFG or command over RCON.
4. Confirm the result on the server.

CTF, deathrun, OITC, 1v1 arenas, Roll the Dice, and MatchZy require server-side
support not installed by the control plane.

## Network access

Use a distinct RCON password, restrict the RCON port to the control-plane host,
and do not expose it publicly. Add a server only after RCON authentication
succeeds from the control-plane network.
