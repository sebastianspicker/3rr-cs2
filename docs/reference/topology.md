# Topology

Recommended default topology:

- one or more CS2 servers
- host-level updater per machine or per runtime
- optional panel service with SQLite for small installs or Redis-backed sessions for multi-instance deployments

```mermaid
architecture-beta
    group host(server)[Host Machine]

    service cs2(database)[CS2 Server] in host
    service updater(disk)[Updater\n(systemd timer)] in host
    service steamcmd(internet)[SteamCMD] in host

    service panel(server)[Panel\n(Node.js)] in host
    service db(database)[SQLite] in host
    service redis(database)[Redis\n(optional)] in host

    updater:R --> L:steamcmd
    updater:B --> T:cs2

    panel:R --> L:db
    panel:R --> L:redis
    panel:B --> T:cs2
```

The updater talks to systemd and SteamCMD.
The panel talks to running servers over RCON.
Provisioning assets stay static and feed both sides without becoming a runtime service themselves.
