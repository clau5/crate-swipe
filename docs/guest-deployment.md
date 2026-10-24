# Guest sessions on GitHub Pages

The owner chose to make a throwaway Discogs account token public. The app runs entirely as a static site on the existing GitHub Pages address. No Node backend, extra hosting account or server secret is required. The optional Node script is only a localhost static preview.

## Publish

1. Push the tested feature branch to GitHub and merge it into the repository's configured Pages branch.
2. Keep `index.html`, all root JavaScript/CSS files, `assets/` and `.nojekyll` in the published source.
3. Wait for Pages deployment, then check filters, discovery, guest review, shared-account additions and personal-account import on the deployed URL.

The shared token is configured in `config.js` and intentionally visible in published source. If it stops working, replace that throwaway token and republish. Never place a visitor's personal token there.

## Behavior

- Guest finds live in `crate_guest_session_v1` in each browser. Filters and reloads preserve them until New session. Clearing browser storage removes them; there is no cross-device guest recovery.
- Shared account wants do not determine guest hearts or review contents. Guest likes are track-specific, and other visitors' likes do not appear in the local session.
- A guest like also attempts a shared wantlist PUT. Copies are best effort and coalesced per release during the page lifetime. Copy failures do not discard the local find. Guest removals never send a shared DELETE.
- Connecting a personal token validates the destination directly with Discogs, refreshes its wantlist and imports this guest session only. Existing personal discoveries and wanted pressings are preserved. Import only adds; failed or interrupted entries remain retryable.
- Import status is scoped by destination username. Saved records removed later are not resurrected during a retry. Switching to another personal account imports the guest finds independently, without copying the previous account's other discoveries.
- New session clears local views without deleting any remote wantlist records. A personal token stays in the visitor's browser and goes directly to Discogs; it is never sent to GitHub or another visitor.

## Shared-account tradeoff

The public token can be extracted and used outside this app to access API operations available to that account, including wantlist changes. The app's safeguards are not access controls on the published token. This is explicitly accepted for the throwaway account.

All visitors share its Discogs request allowance. Each browser uses the existing rate limiter and retry/backoff, but a static app cannot coordinate one global request queue across devices. Several simultaneous digs or outside token use may slow browsing. Personal-token mode uses that visitor's own account allowance.

## Local tests

Use Node 24: `node scripts/serve.mjs`, then open the HTTP address rather than `index.html` as a file. The local guest demo is `/?fixture=1&guest=1`; it uses simulated players and makes no real writes.

Run `node --test tests/*.test.js`, `pnpm test:browser` and `BROWSER=webkit pnpm test:browser` against the running localhost server. Browser tests replace the shared configuration with a fake token and mock Discogs endpoints, so the suite never writes to real accounts.

Live shared-account access and real iPhone playback still need a deployed smoke test. Existing YouTube availability probes cannot guarantee playback in every region or account.
