# Hosting checklist for the MIA PWA

This checklist is for whoever arranges hosting. **No hosting is configured and nothing has been deployed.** People who use MIA do not need an account or a paid plan; the hosting maintainer may need a provider account, and free plans can change.

## What is being hosted

- The static files in `web/` only: `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `_headers`.
- No build step, server code, database, or API. Do not publish `ios/`, `backend/`, `database/`, `docs/` or other folders (ADR-008: source and specifications stay private).
- The app makes no network requests except for its own files. Audio is never uploaded.

## Options

| Option | Maintainer account | Reads `web/_headers` | Access gate | Notes |
|---|---|---|---|---|
| Internal company hosting (IT) | Company-managed | No; configure equivalent headers | Company SSO/VPN | Best fit for enterprise governance and data-handling review. |
| Cloudflare Pages | Yes | Yes | Optional, via Cloudflare Access | Can deploy from a private repository or by direct upload of `web/`. |
| Netlify | Yes | Yes | Paid plans for password protection | Similar to Cloudflare Pages. |
| GitHub Pages | Yes (repository owner) | No | No | Not recommended: a private repository needs a paid GitHub plan for Pages, and custom headers are not supported. |
| Vercel | Yes | No; needs `vercel.json` | Paid | Not recommended: the free Hobby plan is for non-commercial personal use only. |

Check each provider's current terms and data-processing terms before use; this table reflects the repository's needs, not a contract review.

## Required settings

1. **HTTPS only.** iPhone Safari allows the microphone and Home Screen install only on HTTPS.
2. **Serve `web/` as the site root**, or under a sub-path; all paths in the app are relative.
3. **Response headers**, from `web/_headers`:

   | Header | Value | Why |
   |---|---|---|
   | `Content-Security-Policy` | as in `web/_headers` (`connect-src 'self'` etc.) | Blocks loading or sending data to other sites |
   | `Permissions-Policy` | `microphone=(self), camera=(), geolocation=()` | Microphone only for MIA itself |
   | `Strict-Transport-Security` | `max-age=31536000` | Forces HTTPS |
   | `X-Content-Type-Options` | `nosniff` | |
   | `Referrer-Policy` | `no-referrer` | |
   | `X-Frame-Options` | `DENY` | Prevents embedding |
   | `Cache-Control` on `/` and `/index.html` | `no-store` | Updates and any access gate apply at each launch |
   | `Cache-Control` on `/sw.js` | `no-cache` | Service-worker updates are picked up |

4. **MIME types:** `manifest.webmanifest` as `application/manifest+json`, `icon.svg` as `image/svg+xml`, `.js` as `text/javascript`.
5. **No analytics, tag managers, or injected scripts** from the host (some providers offer them; keep them off). The CSP will block most of these anyway.
6. **Decide on an access gate.** Without one, anyone with the URL can load the app (each visitor's recordings still stay on their own device). The service worker never caches HTML, so a gate is checked at each launch.

## Verify after a deployment

Do not announce a URL until all of these pass on the deployed address:

```sh
URL=https://example.invalid/   # replace with the real deployed URL
curl -sI "$URL" | grep -iE 'content-security-policy|permissions-policy|strict-transport-security|cache-control'
curl -sI "${URL}manifest.webmanifest" | grep -i content-type
curl -sI "${URL}sw.js" | grep -i cache-control
```

Then, on a real iPhone in Safari: run the same checklist as in [iPhone LAN testing](iphone-lan-testing.md#steps), step 5.

## Updating the app after hosting

- Change `CACHE_NAME` in `web/sw.js` for each release so iPhones pick up new `app.js` files.
- Recordings are stored per web address. Moving to a different URL or domain means users start with an empty list; ask them to export recordings first.
