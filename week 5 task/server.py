#!/usr/bin/env python3
"""Tiny dev server with SPA fallback.

Serves static files from this folder; any path that is not an existing file
(e.g. /products/nova-watch) returns index.html so that deep links and page
refreshes work with History API routing.

Usage:  python3 server.py [port]      (default 8000)
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not os.path.splitext(self.path.split("?")[0])[1]:
            self.path = "/index.html"      # SPA fallback for extension-less routes
        return super().send_head()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"Orbit SPA running at http://localhost:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
