# Crate Swipe

A little digging. A great discovery.

Swipe through vinyl releases, listen to linked YouTube tracks and save records to your Discogs wantlist. Reopen **This session** to listen to your finds again or remove a record. The session stays on this browser until you start a new one.

<p>
  <img src="docs/screenshots/playback-mobile.png" width="200" alt="Playback screen">
  <img src="docs/screenshots/session-mobile.png" width="200" alt="Session discoveries">
  <img src="docs/screenshots/release-mobile.png" width="200" alt="Release details">
</p>

## Run locally

Use Node.js 24 or newer. No dependencies or build step are needed to serve the app:

```sh
node scripts/serve.mjs
```

Open [the local app](http://127.0.0.1:4173/). Connect with your own Discogs personal access token. The token stays in localStorage on that browser/origin and is sent only to the Discogs API. Do not commit it to the repository or put it in a URL.

For a deterministic, credential-free local demo, open [the local demo](http://127.0.0.1:4173/?fixture=1). It uses simulated players and Discogs responses; it does not make external requests or play real audio. This mode is disabled on public hosts.

## How it works

- Choose a genre/style, year range, label or country. Only vinyl releases and videos already linked on Discogs are included.
- Swipe vertically or use ↑/↓. Tap artwork to pause/play; the first tap enables sound. Scrub to seek.
- Tap the heart or double-tap artwork to add/remove the **record** on your Discogs wantlist immediately.
- The stacked-records button opens **This session**: tracks you explicitly liked in this session, with replay and removal controls. It is not a checkout and does not show your entire historic wantlist.
- Discogs saves releases, not individual tracks. Removing a record also removes session tracks linked to that wanted version. Other wanted pressings are retained.
- Session replay has its own playback position/order. Closing it returns to the discovery track and position you left.
- Tap the release metadata to see its tracklist and Discogs link.
- **Start new session** clears the local discoveries view only. Filters and reloads do not clear it, and your remote wantlist is unaffected.
- Keyboard: Space pause/play, L toggle wanted record, E release details, M mute. Escape closes a panel; Tab stays inside it.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | Accessible page shell, forms and panels |
| `styles.css` | Figma-derived layout, responsive rules and Inter typography |
| `app.js` | UI, feed, shared players, seek controls and authentication |
| `core.js` | Original v2.3 discovery, matching, rate-limited API and cache integration |
| `session.js` | Per-account persistent discoveries and record-level wantlist mutations |
| `assets/` | Local Figma SVG exports and Inter webfont/license |
| `tests/` | Unit tests, localhost fixture and browser acceptance suite |

Existing `dx_token`, `dx_user`, `dx_opts`, `dx_seen`, `dx_stats` and the IndexedDB release cache remain compatible. New session/remote-state caches are scoped by Discogs username. A complete wantlist refresh is required before mutation controls are enabled; failed reads are shown as unknown, rather than an empty wantlist.

## Test

Syntax and logic checks need no installed dependencies:

```sh
node --check app.js
node --check core.js
node --check session.js
node --test tests/*.test.js
```

For browser checks, install the pinned development dependency with pnpm, then its browsers:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
```

Keep the local server running in another terminal:

```sh
pnpm test:browser
BROWSER=webkit pnpm test:browser
```

On macOS, you can use an existing Chrome installation instead of downloading Chromium:

```sh
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm test:browser
```

The browser suite blocks external requests, uses fake wantlist writes and saves screenshots and a JSON report in ignored `test-results/`. WebKit output lives in `test-results/webkit/`. Use `PORT` for the local server and `BASE_URL` for browser checks if another local port is needed.

## Publish on GitHub Pages

This is a static site. Push the source files to the existing repository and serve the repository root from the chosen Pages branch. Keep `.nojekyll`. There is no build output to generate, no server to deploy and no production secret to configure.

Include `index.html`, the JavaScript/CSS files and `assets/`. Paths are relative, so the app works under `/crate-swipe/` and on a custom domain. Development files can remain in the repository; fixture mode cannot activate on the public Pages hostname. Do not upload `node_modules`, `.browsers`, `artifacts`, `test-results`, `.env` files or credentials.

See [implementation notes and test evidence](docs/implementation-notes.md) for the validation scope and remaining live-device checks.

## Design and credits

Playback layout: [Crate Figma reference](https://www.figma.com/design/WLaSHMeVF4am22j71aRoPH/Crate?node-id=1-8). Inter is used throughout as agreed; the design's Aeonik headings are intentionally substituted. SVGs are local exports from the supplied Figma file. The artwork under `tests/` is the supplied reference image for visual testing; production artwork comes from Discogs.

Inter is bundled under its SIL Open Font License, included in `assets/fonts/OFL.txt`. No project-wide license has been added to the upstream repository.
