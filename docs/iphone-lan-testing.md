# Test MIA on a real iPhone over local Wi‑Fi (HTTPS, no hosting account)

This is a **test-only** setup for whoever maintains MIA. It lets an iPhone open the PWA over HTTPS from a computer on the same Wi‑Fi, so the microphone and **Add to Home Screen** can be checked before any hosting is arranged. It needs no hosting, cloud, or app account and has no cost.

It is not a hosting solution. The computer is needed to **install or update** MIA. After MIA has been opened once from the computer (ideally from the Home Screen icon), it opens offline from the iPhone's cache, even when the computer is off or on another network.

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

1. **Find the computer's local name (use this, not the IP).**
   - Windows: run `hostname` and add `.local`, in lower case. Example: `LAPTOP-30S5LPQP` → `laptop-30s5lpqp.local`
   - macOS: **System Settings → General → Sharing → Local hostname** (already ends in `.local`)
   - The test server also prints this name when it starts.

   Why a name: the iPhone keeps MIA's recordings per address. An IP address changes between networks (home, office, café), and each new IP looks like a different, empty app. The `.local` name stays the same, so the recordings stay visible.

   On Windows the Wi‑Fi network must be set to **Private** (Settings → Network & internet → Wi‑Fi → the network → *Private network*) so the iPhone can find the name.

2. **Create the test CA and a certificate** (from the repository root). Use the name from step 1:

   ```sh
   mkcert -install
   mkdir -p .local-certs
   mkcert -cert-file .local-certs/mia-lan.pem -key-file .local-certs/mia-lan-key.pem laptop-30s5lpqp.local localhost
   ```

   `.local-certs/` is ignored by git. This certificate keeps working when the IP changes, so it is made only once.

3. **Install the CA on the iPhone.**
   - Run `mkcert -CAROOT` and send `rootCA.pem` (not `rootCA-key.pem`) to the iPhone with AirDrop, or by email to yourself.
   - On the iPhone: **Settings → General → VPN & Device Management** → tap the downloaded profile → **Install**.
   - Then: **Settings → General → About → Certificate Trust Settings** → turn on full trust for the mkcert certificate.

4. **Start the test server:**

   ```sh
   python3 tools/serve_lan_https.py --cert .local-certs/mia-lan.pem --key .local-certs/mia-lan-key.pem
   ```

   It prints the address to open. If the computer's firewall asks, allow incoming connections for Python.

5. **Test on the iPhone.** Open `https://laptop-30s5lpqp.local:8443/` (your name from step 1) in **Safari** and check:

   | Check | Expected |
   |---|---|
   | Page opens with no certificate warning | Lock icon, no warning page |
   | iOS warning shows before recording | Yellow notice above the timer |
   | Tap **Start recording** | iOS asks for microphone permission |
   | Record 1–2 minutes, tap **Stop and save** | Recording appears in the list and plays back |
   | **Export** | Share sheet opens; saving to Files works |
   | **Share → Add to Home Screen**, then open from the icon | Opens full screen; recording again works |
   | Leave the iPhone untouched for 3 minutes while recording | Screen stays on (MIA keeps it awake); timer keeps running |
   | Switch to another app during a recording, then return | If recording stopped: status says it stopped and a large **Resume** button appears; tapping it records "part 2" |
   | **Export** a recording | Its line changes from *Not exported* to *Exported* with the date |
   | Delete a recording that was never exported | Stronger warning that it cannot be recovered |
   | Stop the server (`Ctrl+C`), close MIA fully, then open it from the Home Screen icon | MIA still opens and the recordings are still listed |
   | Delete a recording | It disappears from the list |

   Record what you observe, including the iOS version. Use non-confidential audio only.

6. **Clean up after testing.**
   - Stop the server with `Ctrl+C`.
   - On the iPhone: **Settings → General → VPN & Device Management** → remove the mkcert profile.
   - Optional on the computer: `mkcert -uninstall`, then delete `.local-certs/`.

## Updating MIA after a code change

Start the server and open MIA on the iPhone while both are on the same Wi‑Fi. The new version downloads in the background. Close MIA fully and open it again to use it.

## Limits of this test

- Recordings are tied to the address MIA was opened from. Always use the same `.local` name and port; opening MIA by IP, or in Safari instead of the Home Screen icon, shows a separate, empty list.
- If the `.local` name does not open on the iPhone (some routers block it), the IP fallback printed by the server works, but recordings made through it are separate and the certificate must include that IP.
- If the iPhone profile or the mkcert CA is removed, MIA still opens offline, but updating it needs the profile again.
- Passing this test does not prove that long meetings record fully; iOS can still stop recording in the background or when the screen locks.
