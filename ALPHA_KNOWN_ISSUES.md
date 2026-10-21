# 3RR alpha: known issues

Thank you for testing 3RR. This alpha is for a **single trusted team** running the panel
against CS2 servers they already operate. Use a non-critical server. You build the panel
yourself from source; there is no published container image yet.

## What doesn't work yet, or hasn't been confirmed

- **Workshop maps in Setup have not yet been tested on a live CS2 server.** Setup loads
  Workshop maps by their Workshop ID, the way CS2 servers expect. If a Workshop map does not
  load, or Check result keeps saying "Requested map not confirmed" although the right map is
  running, please report it (see below). Stock maps such as Dust II are not affected.
- **Player list on some servers.** The list is built from the server's `users` command. If you
  see a player named "users", or a player shown with the wrong number, please send us the raw
  output of `users` from your server console.
- **"Unable to authenticate" with the right RCON password.** On some networks the server's
  reply to the panel's login can arrive in a form the RCON library does not handle. If adding
  a server fails although the password is correct, please tell us your CS2 build and network
  setup.
- **The host updater is not part of this alpha.** It received many fixes but has not been run
  on a real Linux host yet; do not schedule it on a server you care about.
- **The free-form console blocks commands that could shut the server down, change RCON or
  logging, or load plugins, but this is a best-effort block list.** Give panel accounts only
  to people you would trust with the RCON password itself.

## Things that changed or now fail on purpose

- **Everyone signs in again once after upgrading.** Changing your password now signs you out
  everywhere else.
- **The Compose example needs a Redis password.** Add `REDIS_PASSWORD` to your panel
  environment file (for example the output of `openssl rand -hex 32`); the example refuses to
  start without it.
- **RCON passwords** may contain only plain keyboard characters (letters, digits, spaces and
  ordinary symbols). Passwords with line breaks, tabs or accented letters are rejected when
  you add a server.
- **The CS2 startup wrapper** additionally refuses passwords and Steam tokens containing `"`
  or `\`, because CS2 config files cannot hold them unchanged. Change such a password before
  using the wrapper.
- **The CS2 Compose example** refuses to start if `RCON_PASSWORD` is empty, instead of
  restarting in a loop.
- **The administrator-file generator** refuses to overwrite files you already have; add
  `--force` if you really want new ones. Replace `REPLACE_WITH_STEAMID64` with your SteamID64
  before you start the server, and keep the `#` at the start of group names.
- **Addresses on the panel host itself are blocked on purpose**, including IPv6 spellings of
  them. Add servers by their LAN or public address.

## Workarounds

- If a Workshop map does not load from Setup, use the separate Workshop map action with the
  map's Workshop ID, and tell us what happened.
- If the console says a command is blocked, use the dedicated buttons on the server page, or
  run the command on the server itself.

## How to report a bug

Open a bug report on the project's GitHub issue tracker and include:

1. The commit or tag you built (`git rev-parse HEAD`).
2. Your Node version (`node --version`) and how you run the panel (directly or with Compose).
3. Steps to reproduce, what you expected and what happened.
4. The panel log lines around the time of the problem. They are JSON lines on the panel's
   standard output, or in `docker compose logs panel`. Each line has a `request_id`; the same
   ID is in the `X-Request-Id` response header your browser received, which makes the right
   lines easy to find.
5. For map or player problems, the raw output of `status` and `users` from the server console.
6. For page problems, a screenshot and the browser console output.

**Remove passwords, Steam tokens, session secrets and private IP addresses before you post.**
For security problems, do not open a public issue. Use a private GitHub security advisory
instead, as described in the security policy.
