# CS2 server requirements

The panel sends RCON commands to an existing CS2 server. Controls succeed only
when their corresponding maps, CFG files, and plugins exist on that server.

## CFG files

Copy the required files from `apps/operate/panel/cfg` into the server's
`game/csgo/cfg` directory. Available presets include:

- `warmup.cfg`
- `knife.cfg`
- `wingman.cfg`
- `live_wingman.cfg`
- `bhop.cfg`
- `ctf.cfg`
- `deathmatch.cfg`
- `deathrun.cfg`
- `gungame.cfg`
- `oitc.cfg`
- `1v1arenas.cfg`
- `scoutzknivez.cfg`
- `surf.cfg`
- `random_rounds_on.cfg`
- `random_rounds_off.cfg`
- `rtd_on.cfg`
- `rtd_off.cfg`

MatchZy live-match controls execute `live.cfg`. A reference file is stored at
`apps/operate/panel/cfg/server-provided/live.cfg`. Copy it to
`game/csgo/cfg/live.cfg` or supply an equivalent server-local file.

Verify each enabled preset through RCON:

```text
exec warmup.cfg
exec live.cfg
```

## Plugins

Several controls assume Metamod, CounterStrikeSharp, MatchZy, or a
mode-specific plugin. CFG files configure base server rules but do not provide
plugin or map-script behavior.

Before exposing a control to operators:

1. Install the required server-side plugin or map.
2. Run `css_plugins list` and confirm the plugin loaded.
3. Execute the corresponding CFG or command over RCON.
4. Confirm the result on the server.

CTF, deathrun, OITC, 1v1 arenas, Roll the Dice, and MatchZy controls require
server-side support not installed by this repository.

## Network access

Use a distinct RCON password, restrict the RCON port to the panel host, and do
not expose it to the public internet. Add the server to the panel only after
RCON authentication succeeds from the panel's network.
