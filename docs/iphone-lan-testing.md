# Test MIA on a real iPhone over local Wi‑Fi (HTTPS, no hosting account)

This is a **test-only** setup for whoever maintains MIA. It lets an iPhone open the PWA over HTTPS from a computer on the same Wi‑Fi, so the microphone and **Add to Home Screen** can be checked before any hosting is arranged. It needs no hosting, cloud, or app account and has no cost.

It is not a hosting solution: the app is only reachable while the computer is on, the server is running, and the iPhone is on the same network.

## What stays the same

- The server only serves the static files in `web/`. It rejects `POST`, `PUT`, `PATCH` and `DELETE`; the PWA never sends audio anywhere.
- Recordings stay in the iPhone browser's storage, exactly as with real hosting.
- Response headers from `web/_headers` (CSP, Permissions-Policy, cache rules) are applied, except HSTS, which is skipped so that a test hostname is not pinned for a year.

## Security note before you start

mkcert creates a private certificate authority (CA) on the computer. Once the iPhone trusts that CA, anyone holding the CA key on that computer could create certificates the iPhone accepts for **any** website.

- Keep the CA key (`rootCA-key.pem`, shown by `mkcert -CAROOT`) on that computer only. Never share or commit it.
- Do this on a personal test iPhone or remove the profile after testing (step 6).
- Use a trusted home or office Wi‑Fi, not public Wi‑Fi.
- If company device management (MDM) blocks installing profiles, use hosting instead (see `docs/hosting.md`).

## Requirements

- A Mac, Windows or Linux computer with Python 3.8 or newer.
- [mkcert](https://github.com/FiloSottile/mkcert) (macOS: `brew install mkcert`; Windows: `choco install mkcert` or `winget install FiloSottile.mkcert`).
- The iPhone and the computer on the same Wi‑Fi. Some office or guest networks block devices from reaching each other.
- A copy of this repository on the computer.

## Steps

1. **Find the computer's LAN IP address.**
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` and read *IPv4 Address*
   - Example used below: `192.168.1.20`

2. **Create the test CA and a certificate** (from the repository root):

   ```sh
   mkcert -install
   mkdir -p .local-certs
   mkcert -cert-file .local-certs/mia-lan.pem -key-file .local-certs/mia-lan-key.pem 192.168.1.20 localhost
   ```

   `.local-certs/` is ignored by git.

3. **Install the CA on the iPhone.**
   - Run `mkcert -CAROOT` and send `rootCA.pem` (not `rootCA-key.pem`) to the iPhone with AirDrop, or by email to yourself.
   - On the iPhone: **Settings → General → VPN & Device Management** → tap the downloaded profile → **Install**.
   - Then: **Settings → General → About → Certificate Trust Settings** → turn on full trust for the mkcert certificate.

4. **Start the test server:**

   ```sh
   python3 tools/serve_lan_https.py --cert .local-certs/mia-lan.pem --key .local-certs/mia-lan-key.pem
   ```

   It prints the address to open. If the computer's firewall asks, allow incoming connections for Python.

5. **Test on the iPhone.** Open `https://192.168.1.20:8443/` in **Safari** and check:

   | Check | Expected |
   |---|---|
   | Page opens with no certificate warning | Lock icon, no warning page |
   | iOS warning shows before recording | Yellow notice above the timer |
   | Tap **Start recording** | iOS asks for microphone permission |
   | Record 1–2 minutes, tap **Stop and save** | Recording appears in the list and plays back |
   | **Export** | Share sheet opens; saving to Files works |
   | **Share → Add to Home Screen**, then open from the icon | Opens full screen; recording again works |
   | Lock the screen for ~30 seconds during a recording | Note what happens: stops, pauses, or marked possibly incomplete |
   | Switch to another app during a recording, then return | Same as above |
   | Delete a recording | It disappears from the list |

   Record what you observe, including the iOS version. Use non-confidential audio only.

6. **Clean up after testing.**
   - Stop the server with `Ctrl+C`.
   - On the iPhone: **Settings → General → VPN & Device Management** → remove the mkcert profile.
   - Optional on the computer: `mkcert -uninstall`, then delete `.local-certs/`.

## Limits of this test

- Home Screen icons installed from this address stop working when the server is off, and recordings stored under this address stay separate from those on any future hosted URL (browser storage is per address).
- If the computer's IP changes, the certificate must be recreated for the new IP, and the iPhone sees it as a different app.
- Passing this test does not prove that long meetings record fully; iOS can still stop recording in the background or when the screen locks.
