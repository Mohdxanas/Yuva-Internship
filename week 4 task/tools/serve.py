"""Tiny static server with gzip, so local tests behave like a host that compresses text files."""
import gzip, http.server, mimetypes, os, sys, functools

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        path = self.translate_path(self.path.split('?')[0])
        if os.path.isdir(path): path = os.path.join(path, 'index.html')
        if not os.path.exists(path):
            self.send_error(404); return
        data = open(path, 'rb').read()
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if path.endswith('.svg'): ctype = 'image/svg+xml'
        self.send_response(200)
        self.send_header('Content-Type', ctype + ('; charset=utf-8' if ctype.startswith('text') or 'javascript' in ctype else ''))
        if ctype.startswith('text') or 'javascript' in ctype or 'svg' in ctype:
            if 'gzip' in self.headers.get('Accept-Encoding', ''):
                data = gzip.compress(data, 9); self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers(); self.wfile.write(data)

if __name__ == '__main__':
    root, port = sys.argv[1], int(sys.argv[2])
    os.chdir(root)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
