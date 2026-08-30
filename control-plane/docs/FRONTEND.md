# Frontend architecture

The control plane uses EJS for server-rendered pages and bundled TypeScript for
authenticated browser interaction.

## Source layout

- `web/views/` contains pages and EJS partials.
- `web/client/console.ts` is the browser bundle entry for `/servers` and
  `/manage/:server_id`.
- `web/client/common.ts` provides same-origin JSON requests, CSRF headers,
  notifications, loading state, and confirmation dialogs.
- `web/client/server*.ts` owns inventory behavior.
- `web/client/manage*.ts` owns setup, status, players, RCON, Workshop, and
  server controls.
- `web/assets/css/` contains maintained stylesheet modules.
- `scripts/build-web.mjs` emits browser files to `web/generated/`, including
  CSS, fonts, the mark, and JavaScript bundles.

Edit the maintained sources, never `web/generated`.

## Browser contracts

Template IDs and `data-*` attributes are consumed by browser modules and tests;
treat them as behavior, not presentation-only markup. State-changing requests
are same-origin and include the rendered `X-CSRF-Token`. The
[HTTP API](API.md) distinguishes requested configuration from observed server
state; preserve `unknown`, `disconnected`, and `error` as distinct states.

Shared JSON requests time out after 15 seconds. A late setup or Workshop
response must not overwrite a newer operator selection. Stable `/css`, `/js`,
font, and image URLs revalidate on page load; they must not be immutable until
the build adds content hashes.

## Theme and accessibility

The default theme is dark. `data-theme="light"` enables the light theme, and
the appearance control stores `light` or `dark` in local storage key
`3rr.theme`. `web/views/partials/theme-boot.ejs` applies it before the
stylesheet loads.

The UI includes landmarks, headings, a skip link, visible focus, native
validation, non-color status labels, live feedback, keyboard-contained dialogs,
reduced-motion handling, and responsive layouts. Browser and assistive-
technology validation remain manual release activities.
