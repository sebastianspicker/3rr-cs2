# Control-plane screenshots

These screenshots show the Express/EJS application running in Chromium with
temporary test data. The servers, teams, and RCON responses are simulated;
the screenshots do not show a live CS2 deployment.

The [manifest](manifest.json) records the capture time, browser, routes, and
viewport sizes. The desktop tour follows one session: choose a server, review
setup, send commands, and check the reported map. The mobile capture shows
the same result at 390 pixels wide.

To refresh all five images, use Node 22 and run from the repository root:

```bash
cd control-plane
npm ci
npx playwright install chromium
npm run build
node scripts/capture-screenshots.mjs
```

The script starts a local app with temporary SQLite data, blocks external
browser requests, captures the screens, and closes the app and database. It
does not read `.env` or connect to a game server. Review each image before
committing it, and keep README captions aligned with the captured behavior.

To try the same session flow with local simulated actions, open the
[browser demo](../../design-preview/README.md).
