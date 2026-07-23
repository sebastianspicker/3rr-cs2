# 3RR Screenshot Capture Manifest

The README tour was regenerated on 2026-07-23 for the local freeze candidate
tagged `v1.1.0-alpha.1`, with Node 22.23.1, Playwright 1.59.1, and Chromium.
Captures use the bundled `panel.css` and the default Night Desk dark theme
(theme boot does not force light; Settings Appearance is visible on
`05-settings.png`).

Run `npm run screenshots` from `apps/operate/panel` to recapture from the exact
tagged commit before publishing a GitHub prerelease. The command uses an
isolated database and documentation-only fixture values:

1. `01-login.png` - signed-out login state with no real account or deployment details.
2. `02-servers.png` - server inventory using documentation-only hostnames and addresses.
3. `03-add-server.png` - add-server form with the reserved `203.0.113.10` address and an empty
   RCON password.
4. `04-manage.png` - authenticated management surface with truth rail, observed status,
   and safe non-production fixture data.
5. `05-settings.png` - password form and Appearance theme control (Night Desk / Daylight).
6. `06-users.png` - administrator access table and user-creation form.
7. `07-manage-tablet.png` - management workspace at 900 x 1024.
8. `08-manage-mobile.png` - management workspace at 390 x 844.

The current 1536 x 1024 desktop captures were reviewed for clipping, readable
status labels, empty/error truthfulness, truth-rail visibility, and the absence
of real usernames, credentials, tokens, hosts, IP inventories, and browser chrome.
The capture command also fails on browser errors or horizontal overflow and
verifies the first keyboard focus target and every route at 900 x 1024 and
390 x 844.

Do not copy an image from a different commit or reconstruct the UI in an image
editor. Record the candidate commit and capture command in `RELEASE_STATUS.md`
when the gallery is regenerated for a published release.
