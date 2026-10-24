# Crate Swipe 3.0 implementation notes

Prepared 24 October 2026 against upstream commit `727198d23a5ce59c57baae710c015d79206ca1ea` (2.3.0). Local branch: `feat/crate-redesign-session`. No remote push or deployment was performed.

## Delivered

- Playback screen rebuilt from the supplied 402 × 874 Figma frame: filter pill, session action, release metadata, centered 300px artwork, 5% artwork crop, bounded blurred glow, artist/track, outline/filled heart, white seek bar and YouTube attribution.
- Agreed Inter substitution throughout. All icons and fonts are local files; artwork remains driven by release metadata. Figma download URLs are absent from runtime files.
- Filters, token setup, release details and a new session discoveries view share the visual language. Only the playback screen had an exact Figma reference; the other layouts are adaptations.
- Session discoveries persist per Discogs username across reloads, changed filters and revisits. Starting a new session clears this local view only.
- Heart, double tap and L retain immediate Discogs record-level add/remove semantics. Session replay does not change the wantlist. Removing a wanted record updates related session entries; alternate wanted pressings are not deleted implicitly.
- Playback identity/order is separate from the feed index. Replay updates titles, attribution, duration and seeking; closing the view restores the discovery track and position. Paused return positions are cued rather than autoplayed.
- Failed reads keep the wantlist status unknown; successful snapshots reconcile external removals. Failed writes retain their previous state, and independent successful writes are not rolled back.
- Shared player iframes retain their DOM parents during overlays and iOS sound-unlock handling.
- Static hosting remains unchanged: native ES modules and CSS, with no production dependencies or build step. pnpm/Playwright are for development tests only.

## Validation

The committed tests are reproducible using the README commands. Final results and screenshots are packaged with this handoff under `docs/screenshots/` and `docs/test-evidence/`.

- 18 Node logic checks cover matching/feed preservation, dry-run transport, immediate writes, persistence/reset, account isolation, same-record locking, alternate pressing removal, independent request failure, snapshot/write races, stale reads, storage failure and malformed cached wants.
- 14 browser scenarios pass in each of pinned Playwright Chromium and WebKit with simulated players and intercepted Discogs endpoints. They cover the reference geometry, local assets, likes, persistent session replay, auto-next isolation, filters, release replay/seek, session reset, write/read failure and retry, focus/Escape, small/large viewports, long text, missing artwork, uncertain matches, double tap/keyboard toggles and the normal production authentication/discovery entry path.
- Viewports: 402 × 874 reference, 320 × 568, 390 × 844 and 1440 × 900. Long titles wrap within bounded text blocks while artwork shrinks to the available height.
- Icons were checked as non-empty local SVGs and at their rendered dimensions: session/heart 24px and attribution play 14px. The heart has a 44px hit area. The seek bar has a larger invisible interaction target and native keyboard semantics.
- Automated browser fixtures block external traffic. The production-entry test intercepts identity/search/release/wantlist and player API requests; it uses a fake token and performs no real account mutations.
- Syntax and whitespace checks pass. GitHub Actions is included for the same local-fixture checks; it has not yet run on GitHub.

## Live verification boundary

The supplied Discogs key was used only for a read-only connection attempt, passed through hidden stdin and held in process memory. It was not added to the repository, fixtures, documentation, screenshots or package.

The API identity endpoint returned HTTP 200 **HTML**, with the title **“Blocked by Cloudflare Gateway”**, instead of Discogs API JSON. This is a gateway access block, not evidence of an invalid token. Requests stopped after identifying that layer. No live account authentication, search, playback or wantlist operation is claimed as verified; no real wantlist writes were attempted.

Desktop WebKit checks validate layout and the mocked playback state machine. Real YouTube audio, iOS user-gesture permission, player swaps, Premium behaviour and real Discogs mutations still need a live check on a permitted connection/device. Those checks are distinct from the automated results.

## Retained behaviour and limitations

- Discovery and fuzzy matching logic were extracted from the original implementation with exports adapted to native modules. The UI's accidentally commented-out error handling was replaced by visible error reporting.
- Original search-page/release cache TTLs, vinyl-only selection, random candidate sampling, master dedupe and adaptive spacing remain in place.
- The existing matcher can mark a song key before excluding a previously seen video, potentially suppressing another upload of that song. That discovery-engine behaviour was identified in planning and left outside this redesign.
- The persistent session is local to this browser/origin and username; it does not sync between devices. Existing Discogs wants from before the session are not automatically imported.
- Runtime errors are rendered as text; no token is logged. No corporate design-library dependency or proprietary Aeonik font is included.

## Review and publish

Review the diff, screenshots and tests before pushing the feature branch to the existing GitHub repository. Serve the repository root through GitHub Pages. No credentials or environment variables are needed in GitHub.

Rollback is a revert to the upstream static files. New session storage keys can remain unused; the existing options, seen history, token and IndexedDB cache were not migrated destructively.

### Final browser receipts

| Engine | Version | Passed |
| --- | --- | --- |
| chromium | 151.0.7922.34 | 14 |
| webkit | 26.5 | 14 |

See `test-evidence/summary.json`, `test-evidence/chromium.json` and `test-evidence/webkit.json`.

## 3.0.1 (iPhone playback fixes)

- One YouTube player for the whole session. iOS grants sound to the iframe that received the first tap; 3.0 alternated between two iframes, so the never-tapped one was refused sound and the fallback turned sound off (`soundOn = false`), leaving every later card muted until tapped. Swipes and auto-next now call `loadVideoById` on the same unlocked player, and sound is never turned off automatically — only pause and mute are user controls.
- The player is never visible. An opaque shield always covers it (it previously showed through between cards while swiping), and the rare iOS "tap once for sound" fallback is now a fully transparent iframe over the cover artwork instead of the exposed YouTube tile.
- Trade-off: no second iframe pre-buffers the next song, so a swipe may take a moment longer to start.
- Embed host stays `https://www.youtube.com` (not youtube-nocookie). Premium in embeds depends on the browser's YouTube sign-in cookies being available to third-party iframes; that is a Safari/Home Screen storage setting, not app code.

## 3.0.3 (quiet recovery and video preflight)

- Routine Discogs retry/rate-limit messages stay out of the toast. Initial loading explains a reconnect inline; authentication, failed saves and exhausted discovery still show actionable errors.
- Before discovery emits cards, public YouTube oEmbed metadata rejects missing/private videos (401/404/410). The preflight sends no credentials, uses at most three requests at once, and caches results locally (six hours for positive metadata, 24 hours for negative metadata).
- Timeouts, network failures, 403, rate limits and server errors mean unknown availability, not a dead video. A 30-second cooldown prevents repeated probes during an outage. Unknown candidates remain usable.
- Playback-confirmed missing/non-embeddable videos (100/101/150) are remembered and removed from the feed quietly. A dead upload cannot consume a track's deduplication key and hide a working alternate upload. HTML5/network and client-identification errors are retryable and never blacklist videos or trigger a rapid skip chain.
- Metadata is not proof of playback in every region/device. Some restrictions are only reported by the player; those still use the quiet runtime recovery path. The single audible iframe is unchanged.
