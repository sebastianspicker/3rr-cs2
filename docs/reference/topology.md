# Topology

Recommended default topology:

- one or more CS2 servers
- host-level updater per machine or per runtime
- panel service with SQLite storage and Redis for production sessions and rate limits

```mermaid
architecture-beta
    group host(server)[Host Machine]

    service cs2(database)[CS2 Server] in host
    service updater(disk)[Updater\n(systemd timer)] in host
    service steamcmd(internet)[SteamCMD] in host

    service panel(server)[Panel\n(Node.js)] in host
    service db(database)[SQLite] in host
    service redis(database)[Redis\n(production)] in host

    updater:R --> L:steamcmd
    updater:B --> T:cs2

    panel:R --> L:db
    panel:R --> L:redis
    panel:B --> T:cs2
```

The updater talks to systemd and SteamCMD.
The panel talks to running servers over RCON.
Provisioning assets stay static and feed the CS2 runtime without becoming a runtime service themselves.

The Compose examples bind the panel to `127.0.0.1` by default. Set
`PANEL_BIND_ADDRESS=0.0.0.0` only for direct network exposure after TLS and
network access controls are in place.
