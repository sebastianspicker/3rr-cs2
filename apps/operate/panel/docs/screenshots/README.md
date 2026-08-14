# Panel screenshot manifest

Run the following command from `apps/operate/panel`:

```bash
npm run screenshots
```

The command builds the panel, starts it with an isolated SQLite database, uses
documentation-only fixture values, and writes these files:

| File                   | Dimensions  | View                              |
| ---------------------- | ----------- | --------------------------------- |
| `01-login.png`         | 1536 x 1024 | Signed-out login                  |
| `02-servers.png`       | 1536 x 1024 | Server inventory                  |
| `03-add-server.png`    | 1536 x 1024 | Add-server form                   |
| `04-manage.png`        | 1536 x 1024 | Server management                 |
| `05-settings.png`      | 1536 x 1024 | Password and appearance settings  |
| `06-users.png`         | 1536 x 1024 | Administrator user management     |
| `07-manage-tablet.png` | 900 x 1024  | Server management at tablet width |
| `08-manage-mobile.png` | 390 x 844   | Server management at mobile width |

The fixture uses reserved documentation hosts and addresses, leaves RCON
credentials empty in public views, and does not connect to a live server.
Management views use fixed local HTTP responses for status, players, and RCON
history. The capture script checks browser errors, horizontal overflow,
clipping, the first keyboard focus target, and all six routes at desktop,
tablet, and mobile widths.

Before a release, rerun the command from the exact candidate commit and review
every image for credentials, tokens, real hosts, operator names, browser chrome,
clipping, and incorrect status labels. Do not edit screenshots by hand.
