# MIA PWA — simple iPhone workflow

MIA is a static web app for recording audio into storage on the iPhone. It has no in-app account, subscription, cloud processing, analytics, or audio upload. Recordings stay in that browser's local storage and do not sync between devices.

## What is needed to use it on iPhone

The app must be served from an HTTPS website before iPhone Safari can reliably access the microphone and install it as a Home Screen app. The website owner or maintainer must arrange hosting; the person using MIA does not need to create a Cloudflare, GitHub, Apple, or MIA account or pay for an app subscription.

There is no hosting address configured by this repository. Until someone hosts the static files, there is no URL to open on iPhone and no Home Screen installation to complete. Hosting services can change their free plans; do not assume that hosting will remain free.

A hosted static site has no sign-in gate in this prototype. Anyone with its URL can load the app, but each visitor's recordings remain in that visitor's own browser storage. The private GitHub source repository does not make a deployed website private. Do not put confidential recordings in this prototype: browser storage is not application-level encrypted.

## Test on an iPhone before hosting

A maintainer can test the microphone and Home Screen install on a real iPhone over local Wi‑Fi with HTTPS, without any hosting account. See [iPhone LAN testing](../docs/iphone-lan-testing.md). This is for testing only and does not provide a URL for other people.

## Use the app

1. Open the HTTPS app address in Safari on the iPhone.
2. Optional: tap **Share → Add to Home Screen** for an icon.
3. Keep MIA open in Safari or from its Home Screen icon, with the screen unlocked.
4. Enter a meeting name if useful, then tap **Start recording** and allow microphone access.
5. Tap **Stop & save** when finished. Play the recording and use **Export** to save a separate copy to Files.
6. Delete recordings you no longer need. Export important audio after each meeting.

For an online meeting, place the iPhone near the laptop speaker. MIA records sound through the iPhone microphone; it does not connect to Teams, Zoom, or Meet.

## iPhone and storage limits

- iOS Safari and Home Screen web apps may pause or stop recording when sent to the background, when the screen locks, during a call, or when iOS needs resources. MIA cannot guarantee a complete meeting recording. Keep it in the foreground with the screen unlocked, and test short recordings on the actual iPhone first.
- If iOS interrupts the page, MIA may recover audio chunks already written to IndexedDB and mark the result as possibly incomplete. It cannot recover sound the browser did not capture.
- Browser storage may be cleared or evicted. Export important recordings after each meeting. MIA marks each recording *Exported* or *Not exported* and shows a reminder for unexported recordings and for recordings older than 90 days. It never deletes a recording on its own.
- While recording, MIA asks iOS to keep the screen on (Screen Wake Lock). If a call or app switch stops the recording anyway, the audio so far is saved and a **Resume** button records the next part.
- After the first visit, the app opens offline from the service worker cache. Updates download the next time the app is opened while its server is reachable.
- This prototype does not encrypt recordings at the application level. Use non-confidential audio.
- Microphone access and Home Screen installation require an HTTPS origin. Offline app caching does not make recording reliable offline, and the app does not sync recordings.
- Imports are optional and only read a file that the user chooses on the device. They are not uploaded.

## Current scope

Implemented: live microphone recording, local IndexedDB storage, recovery of saved chunks, optional local audio import, playback, export, deletion, rename, attaching and reading a transcript, and an English interface designed for iPhone.

Transcripts are made on the user's own Windows laptop, not in the app: export the recording to `OneDrive › Desktop › MIA › Inbox`, the laptop transcriber writes `<name>.transcript.txt` back to that folder, then tap **Transcript** on the recording and pick that file. See [the laptop transcriber](../tools/transcriber/README.md).

Summaries: in the transcript viewer, **Copy for summary** copies the transcript with Thai summary instructions; paste it into the Claude app. MIA sends nothing itself.

Not implemented: on-iPhone transcription, automatic summaries, action items, cloud sync, remote processing, meeting-platform connection, guaranteed background recording, or a hosted production URL.
