# MIA PWA — free iPhone testing route

This is an installable static web-app prototype. It does not require Apple Developer Program membership, TestFlight, Xcode, or a Mac.

## Zero-cost hosting option

Cloudflare Pages has a Free plan. Its currently published limits include 500 builds/month and up to 20,000 files per site; this small static app is well below those limits. Check plan terms before relying on them long-term.

Create a Cloudflare account on the Free plan, then:

1. Open https://dash.cloudflare.com/ and go to **Workers & Pages**.
2. Select **Create application** → **Pages** → **Connect to Git**.
3. Connect GitHub. Authorize Cloudflare Pages to access only the private `panguess/MIA-Meeting-Intelligence` repository if GitHub presents repository selection.
4. Select `panguess/MIA-Meeting-Intelligence`.
5. Set project name to `mia-meeting` (or another available name).
6. Set **Production branch** to `main`.
7. Set **Framework preset** to None.
8. Set **Build command** to `exit 0` (or leave it blank for a no-build static site).
9. Set **Build output directory** to `web`.
10. Deploy. Cloudflare will provide an HTTPS `*.pages.dev` address and redeploy when the connected branch changes.

Official setup guide: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/

## Important privacy step before use

A deployed Pages URL is publicly reachable unless you add an access-control layer. The GitHub source repository can remain Private, but the website itself is not private just because its source repository is private.

Before using MIA, protect the production `*.pages.dev` hostname. Cloudflare's Pages dashboard provides an **Enable access policy** setting. Follow the current Pages-specific sequence:

1. Workers & Pages → select the MIA Pages project → Settings → **Enable access policy**.
2. Select **Manage** on the Access policy created for preview deployments.
3. In Access → Applications, select the MIA project → Configure.
4. Under Public hostname, remove the wildcard (`*`) from the Subdomain field and save. Cloudflare may ask you to change the application name.
5. Return to the Pages project → Settings → General and enable the access policy again so preview deployments are protected too.
6. Confirm that there is one Access application for the production `*.pages.dev` hostname and a separate one for preview deployments.
7. Set the production policy to **Allow** only your own email address. Do not choose “Everyone”.

Cloudflare's Access Free plan is advertised for teams under 50 users: https://www.cloudflare.com/th-th/sase/products/access/

The app does not upload recordings, transcripts, or audio files to Cloudflare. Cloudflare serves the static app files. However, until the production hostname is protected, anyone who knows the URL can open the app and use it on their own device.

## Install on iPhone

1. Open the protected HTTPS Pages URL in Safari on iPhone.
2. Complete the Cloudflare Access email verification.
3. Tap Safari's Share button.
4. Choose **Add to Home Screen**.
5. Open MIA from the Home Screen.
6. Allow microphone access when prompted.
7. Keep MIA in the foreground while recording. Do not lock the screen or switch apps.

## Current behavior

- Live iPhone microphone recording using MediaRecorder.
- Recording chunks are written incrementally to IndexedDB so some captured audio may be recoverable if the browser closes unexpectedly.
- Incomplete sessions are recovered and marked for review on next launch.
- Imports user-selected audio files through the iPhone browser file picker.
- Allows in-app playback, export through the iOS Share Sheet (where supported), and deletion.
- 90-day local cleanup target; browser persistent-storage permission is requested where supported.
- No server upload of audio, analytics, external JavaScript libraries, or AI provider calls.
- JavaScript and app assets can be cached, but the HTML navigation is deliberately not cached so Cloudflare Access can authenticate each app launch. Reopening the app requires an internet connection.

## Critical iOS and privacy limitations

This is a free testing route, not a replacement for a native recorder:
- iOS may suspend Safari or a Home Screen web app when it is backgrounded, the screen locks, or the system needs resources. Recording is not guaranteed to continue. Keep MIA in the foreground.
- Chunk persistence can salvage audio already written to IndexedDB, but it cannot recover audio that iOS never delivered to the browser.
- Browser storage can be evicted by the operating system or cleared by the user. Export important recordings after each meeting.
- IndexedDB is not application-level encrypted by this prototype. Use non-confidential test audio only until the security model is reviewed.
- The 90-day cleanup is best-effort and runs when MIA is opened; it is not a server-side retention guarantee.
- The 1 GiB file-size guardrail does not guarantee the browser has that much storage available.
- Test short recordings, screen-lock behavior, incoming calls, route changes, imports, playback, and export on the actual iPhone before considering longer sessions.

## Not implemented

- Transcription, diarization, meeting minutes, action items, risk/issue extraction
- Cloud sync or backend
- Guaranteed background recording
- Native app packaging or App Store distribution
