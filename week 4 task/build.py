#!/usr/bin/env python3
"""Build step for the Radio Tarang page (Week 4).

  styles.css  --(minify)-->  styles.min.css      full stylesheet, loaded without blocking
  styles.css  --(critical block, minified)-->     inlined into the <head> of index.html
  script.js   --(minify)-->  script.min.js

Needs esbuild (https://esbuild.github.io), e.g.  npm install -g esbuild
Run:  python3 build.py
"""
import os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ESBUILD = os.environ.get('ESBUILD') or shutil.which('esbuild') or 'npx --yes esbuild'

def esbuild(args, stdin=None):
    cmd = ESBUILD.split() + args
    return subprocess.run(cmd, input=stdin, capture_output=True, text=True, check=True, cwd=HERE).stdout

def main():
    css = open(os.path.join(HERE, 'styles.css'), encoding='utf-8').read()

    # 1. Full stylesheet + script, minified
    esbuild(['styles.css', '--minify', '--outfile=styles.min.css', '--log-level=warning'])
    esbuild(['script.js', '--minify', '--target=es2018', '--outfile=script.min.js', '--log-level=warning'])

    # 2. Critical CSS: the block between the two markers, minified, then placed into index.html
    match = re.search(r'/\* critical:start.*?\*/(.*?)/\* critical:end \*/', css, re.S)
    if not match:
        sys.exit('critical markers not found in styles.css')
    critical = esbuild(['--loader=css', '--minify'], stdin=match.group(1)).strip()

    path = os.path.join(HERE, 'index.html')
    html = open(path, encoding='utf-8').read()
    html, n = re.subn(r'(<!-- critical:start -->).*?(<!-- critical:end -->)',
                      lambda m: f'{m.group(1)}<style>{critical}</style>{m.group(2)}', html, flags=re.S)
    if n != 1:
        sys.exit('critical markers not found in index.html')
    open(path, 'w', encoding='utf-8').write(html)

    for name in ('styles.css', 'styles.min.css', 'script.js', 'script.min.js'):
        print(f'{name:16} {os.path.getsize(os.path.join(HERE, name)):>7} bytes')
    print(f'{"critical CSS":16} {len(critical.encode()):>7} bytes (inlined)')

if __name__ == '__main__':
    main()
