# Frontend architecture

The panel uses EJS for server-rendered pages and bundled TypeScript for
authenticated browser interactions.

## Source layout

- `views/*.ejs` defines page structure and route-specific content.
- `views/partials` contains shared navigation, footer, and management sections.
- `public/ts/console.ts` is the browser bundle entry for `/servers` and
  `/manage/:server_id`.
- `public/ts/common.ts` provides same-origin JSON requests, CSRF headers,
  notifications, loading state, and the confirmation dialog.
- `public/ts/server*.ts` manages the inventory.
- `public/ts/manage*.ts` manages setup, status, players, RCON, Workshop, and
  server controls.
- `public/css/*.css` contains stylesheet modules.
- `scripts/build-css.mjs` combines those modules into `public/css/panel.css`.

Edit the stylesheet modules, not `panel.css`.

## Theme

The default theme is dark. Setting `data-theme="light"` on `<html>` enables the
light theme. The application does not switch automatically from
`prefers-color-scheme`.

The appearance control stores `light` or `dark` in the local storage key
`3rr.theme`. `views/partials/theme-boot.ejs` applies that value before the
stylesheet loads.

## Browser contracts

Template IDs and `data-*` attributes are used by browser modules and end-to-end
tests. Treat them as behavior, not presentation-only markup.

State-changing requests are same-origin and send the rendered
`X-CSRF-Token`. The [HTTP API](API.md) distinguishes requested configuration
from observed server state. Browser code must preserve the difference between
`unknown`, `disconnected`, and `error`.

Shared JSON requests time out after 15 seconds. A late setup or Workshop
response must not overwrite a newer operator selection. A status refresh
updates the displayed connection state, map, player counts, and observation
time from the same normalized response.

Stable `/css`, `/js`, font, and image URLs revalidate on page load. Do not mark
them immutable unless the build adds content hashes to their filenames.

## Accessibility and responsive behavior

The primary interaction target is a keyboard-operated laptop or desktop. At
900 pixels the navigation becomes a keyboard-controlled menu and management
content becomes one column. At 680 pixels forms and tabular data reflow for
narrow viewports.

The implementation includes landmarks, headings, a skip link, visible focus,
native validation, non-color state labels, live feedback, keyboard-contained
dialogs, reduced-motion handling, and narrow-screen controls sized for touch.

Browser and assistive-technology validation remains a manual release activity.

## Development and validation

```bash
npm ci
npm run build
npm run format:check
npm run lint
npm run typecheck
npm test
```
