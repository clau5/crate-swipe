# Guest-flow verification — 2026-10-24

Version 3.1.0, branch `feat/guest-sessions`. Updated to GitHub Pages only after the owner explicitly accepted publishing a throwaway token.

- 40 Node tests pass and cover existing logic, guest isolation/persistence/import and the static shared-account client.
- 25 existing playback/UI scenarios plus 5 guest scenarios pass in Chromium and WebKit (60 browser checks). Guest scenarios reject any backend API call and replace the public configuration with a fake token.
- Tests use mocked Discogs endpoints and perform no live account writes.
- Local guest and connected review screenshots are saved with browser reports under ignored `test-results/` and copied to the delivery evidence directory.
- The backend and Docker files from the earlier hosting proposal are removed. Local preview uses a static server only.

No production deployment has been performed for this version. Live shared-account reads/writes and real-device iPhone playback remain unverified. See `guest-deployment.md` for the GitHub Pages rollout.
