#!/usr/bin/env python3
"""Serve the MIA PWA (web/) over HTTPS on the local network for iPhone testing.

This is a test-only server. It does not upload or receive audio: the PWA only
makes GET requests for its own static files. Recordings stay in the iPhone
browser's storage.

Usage:
    python3 tools/serve_lan_https.py --cert CERT.pem --key KEY.pem [--port 8443]

Create CERT/KEY with mkcert (see docs/iphone-lan-testing.md). The response
headers declared in web/_headers are applied so the test matches the intended
hosting configuration as closely as possible.
"""

import argparse
import functools
import http.server
import socket
import ssl
import sys
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
# HSTS is left out on purpose: a one-year HSTS pin on a test hostname such as
# "my-mac.local" would outlive the test. Production hosting should send it.
SKIPPED_HEADERS = {"strict-transport-security"}
EXTRA_TYPES = {
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".js": "text/javascript",
}


def parse_headers_file(path):
    """Parse the Cloudflare/Netlify style _headers file into {pattern: [(name, value)]}."""
    rules = {}
    current = None
    if not path.exists():
        return rules
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw[0].isspace():
            current = raw.strip()
            rules.setdefault(current, [])
        elif current is not None and ":" in raw:
            name, value = raw.strip().split(":", 1)
            rules[current].append((name.strip(), value.strip()))
    return rules


def headers_for(rules, url_path):
    result = []
    for pattern, values in rules.items():
        if pattern == "/*" or pattern == url_path or (pattern.endswith("*") and url_path.startswith(pattern[:-1])):
            result.extend(values)
        elif pattern == "/index.html" and url_path == "/":
            result.extend(values)
    return result


class Handler(http.server.SimpleHTTPRequestHandler):
    rules = {}
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        for name, value in headers_for(self.rules, path):
            if name.lower() not in SKIPPED_HEADERS:
                self.send_header(name, value)
        super().end_headers()

    def do_POST(self):  # The PWA never sends data to the server.
        self.send_error(405, "Method not allowed")

    do_PUT = do_DELETE = do_PATCH = do_POST


def local_hostname():
    """The computer's Bonjour/mDNS name, e.g. laptop-30s5lpqp.local.

    Using this name instead of the IP keeps the iPhone's MIA address the same
    when the computer gets a new IP, so recordings stay visible in the app.
    """
    name = socket.gethostname().split(".", 1)[0].strip().lower()
    return f"{name}.local" if name else None


def lan_addresses():
    addresses = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))  # Documentation address; no packet is sent.
            addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    return sorted(addresses)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cert", required=True, help="TLS certificate (PEM) created by mkcert")
    parser.add_argument("--key", required=True, help="TLS private key (PEM) created by mkcert")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--bind", default="0.0.0.0", help="Address to listen on (default: all interfaces)")
    args = parser.parse_args()

    if not (WEB_DIR / "index.html").exists():
        sys.exit(f"web/index.html not found under {WEB_DIR}")

    Handler.rules = parse_headers_file(WEB_DIR / "_headers")
    handler = functools.partial(Handler, directory=str(WEB_DIR))
    server = http.server.ThreadingHTTPServer((args.bind, args.port), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certfile=args.cert, keyfile=args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print("MIA LAN test server (test only, not for production).")
    hostname = local_hostname()
    if hostname:
        print(f"  Open on iPhone Safari (recommended, stable): https://{hostname}:{args.port}/")
        print(f"  Create the certificate for this name: mkcert ... {hostname} localhost")
    for address in lan_addresses() or ["<this computer's LAN IP>"]:
        print(f"  Fallback by IP (changes with the network): https://{address}:{args.port}/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
