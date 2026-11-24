# MIA PWA — free iPhone testing route

This is a static, installable web-app prototype. It does not require Apple Developer Program membership, TestFlight, Xcode, or a Mac.

## Hosting
Deploy this `web/` directory as a static site over HTTPS. Cloudflare Pages offers a Free plan and GitHub integration. For this repository, use:
- Production branch: `main`
- Build command: leave blank
- Build output directory: `web`
- Root directory: `/`

Cloudflare Pages documentation:
- https://developers.cloudflare.com/pages/get-started/
- https://developers.cloudflare.com/pages/configuration/git-integration/

The source repository remains private; the deployed static web app URL is accessible to anyone who knows or discovers it unless an access-control layer is separately configured. This prototype uploads no meeting audio or transcripts to the hosting provider.

## Install on iPhone
1. Open the deployed HTTPS URL in Safari on iPhone.
2. Tap Share.
3. Choose Add to Home Screen.
4. Open MIA from the Home Screen.
5. Allow microphone access when prompted.
6. Keep MIA in the foreground while recording. Do not lock the screen or switch apps during a meeting until device testing proves the behavior reliable.

## Current behavior
- Live iPhone microphone recording using MediaRecorder.
- Saves recording chunks and completed audio locally in IndexedDB.
- Imports user-selected audio files through the iPhone browser file picker.
- Allows playback, export/download, and deletion of local recordings.
- 90-day local cleanup target.
- No server upload, analytics, external JavaScript libraries, or AI provider calls.
- Works offline after the initial HTTPS load and service-worker cache.

## Critical iOS limitations
This is a free testing route, not a replacement for a fully tested native recorder. iOS may suspend Safari or a Home Screen web app when it is backgrounded, the screen locks, or the system needs resources. A browser recording can therefore pause or end unexpectedly. The app warns when it detects a visibility change, but cannot guarantee continuous recording through all iOS lifecycle events.

Browser storage can be evicted by the operating system or removed when site/app data is cleared. Export important recordings after each meeting. The 90-day cleanup is best-effort and runs when MIA is opened; it is not a server-side retention guarantee.

Before using for important or confidential meetings, test short recordings, screen-lock behavior, incoming calls, route changes, imports, playback, and export on the actual iPhone.

## Not implemented
- Transcription, diarization, meeting minutes, action items, risk/issue extraction
- Cloud sync or backend
- Guaranteed background recording
- Strong authentication for the public static URL
