# Frontend guide

The control plane renders pages with EJS and uses bundled TypeScript for
authenticated interactions in the browser.

The [product principles](../../PRODUCT.md) describe who the interface is for
and how it should support their work. The separate `design-preview`
directory is a static demo with mock data. It uses the panel's styles and
session flow, with its own local interaction code and no production connections.

## Source layout

- `web/views/` contains the pages and EJS partials.
- `web/client/console.ts` is the browser entry point for `/servers` and
  `/manage/:server_id`.
- `web/client/common.ts` handles same-origin JSON requests, CSRF headers,
  notifications, loading state, and confirmation dialogs.
- `web/client/server*.ts` implements the server-list behavior.
- `web/client/manage*.ts` implements setup, status, player, RCON, Workshop, and
  server controls.
- `web/client/sessionFlow.ts` tracks the submitted setup in browser memory and
  displays the map check separately. `serverSelection.ts` reuses the selected
  server's inventory observation without sending another probe.
- `web/assets/css/` contains the stylesheet source modules.
- `scripts/build-web.mjs` writes browser files to `web/generated/`, including
  CSS, fonts, the mark, and JavaScript bundles.

Edit the source directories above rather than `web/generated`.

After changing panel templates or styles, run `node design-preview/build.mjs`
from the repository root and review the browser demo. Its verifier rejects
stale generated markup or styling; see the [demo guide](../../design-preview/README.md).

## Templates and requests

Browser modules and tests use template IDs and `data-*` attributes, so changing
them can break behavior even when the rendered page looks the same. Requests
that change state stay on the same origin and include the rendered
`X-CSRF-Token`. As described in the [HTTP API](API.md), the interface keeps
requested configuration separate from observed server state and treats
`unknown`, `disconnected`, and `error` as different states.

Shared JSON requests time out after 15 seconds. If a setup or Workshop response
arrives after the operator has made a newer selection, it cannot overwrite that
selection. The stable `/css`, `/js`, font, and image URLs revalidate whenever a
page loads; they cannot use immutable caching until the build gives them
content-hashed names.

## Fleet and server workflows

The interface is built around a centered olive window with square, beveled
controls, recessed fields, ivory text, and gold highlights. The shared Account
menu contains server navigation, settings, appearance, administration, and
logout.

On the fleet page, search and connection filters work with the server list
already in the browser and do not send RCON commands. The summary counts cover
the complete fleet, while the table footer shows the number of filtered rows.
Refresh fetches new observations without clearing the current filters. Deleting
a server remains inside the row's Actions menu and requires confirmation.

The management header groups the endpoint with its observed connection, map,
player count, and observation time. Setup appears first on the page. Its game
type, mode, and map choices come from the catalog APIs, and the operator can add
team names before reviewing the request. Blank team names leave the names on
the server unchanged. While the request is being submitted, the form is locked
to prevent duplicates. The response appears in a separate result view and does
not imply that the requested setup was observed on the server.

Check live map waits for any observation already in progress, then requests
fresh status. It does not send the setup again. When the observed map matches
the request, the interface reports that match while leaving game type, mode,
and team names unverified. Recovery options remain available after a failed
setup even if the requested map later appears. A new setup invalidates result
checks from earlier submissions. Submitted names and request times exist only
in browser memory; they are not stored as a permanent record.

The server tools provide Console, Match, Players, Reconnect, and Refresh. The
advanced setup section contains Workshop maps and collections, map groups,
favorites, and round restart. Its state-changing controls are hidden while the
guided setup result is open. On wider screens, the console places output beside
the sent-command history; on mobile, it stacks them. Throughout the page,
requested configuration remains separate from observed server state.

## Theme and accessibility

The default theme is dark. Setting `data-theme="light"` enables the light
theme. The appearance control saves `light` or `dark` under the local-storage
key `3rr.theme`, and `web/views/partials/theme-boot.ejs` applies the choice
before the stylesheet loads.

The UI includes landmarks, headings, a skip link, visible focus, native form
validation, status labels that do not rely on color, live feedback, dialogs
that contain keyboard focus, an Account menu that closes with Escape,
reduced-motion handling, and responsive layouts. On narrow screens, form
fields, the setup review, and comparison values stack vertically. The server
list scrolls inside a limited-height area. Standard radio-button keyboard
controls keep every server reachable. Theme choices support arrow keys. Validation failures
identify the affected field or move focus to the relevant message.

`npm run test:browser` runs Chromium against the real Express application with
a temporary SQLite database and fixed RCON responses. Assistive-technology and
other-browser testing are still manual release checks.

The low-contrast outer background comes from the decorative
`web/assets/olive-texture.png`. The build copies it to `/olive-texture.png`.
Controls and text remain HTML, and users can switch to the light appearance.
