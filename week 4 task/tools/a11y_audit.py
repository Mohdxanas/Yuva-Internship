"""Automated accessibility audit (Playwright + pixel sampling). Not a replacement for axe/WAVE/Lighthouse:
it checks the things that can be measured reliably from a script, and says what it measured."""
import io, re, sys, json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]

def lum(rgb):
    c = np.asarray(rgb, dtype=float) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
def ratio(l1, l2):
    hi, lo = np.maximum(l1, l2), np.minimum(l1, l2)
    return (hi + 0.05) / (lo + 0.05)
def parse(css):
    m = re.findall(r'[\d.]+', css); return [float(x) for x in m[:3]], (float(m[3]) if len(m) > 3 else 1.0)

report = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    def open_page(w, h=900, q='?time=17:30'):
        ctx = b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce')
        pg = ctx.new_page(); pg.route('**/fonts.*/**', lambda r: r.abort())
        pg.goto(BASE + q, wait_until='load'); pg.wait_for_timeout(500); return ctx, pg

    ctx, pg = open_page(1280)

    # ---------- structure ----------
    s = pg.evaluate("""() => {
      const out = {};
      out.lang = document.documentElement.lang;
      out.h1 = document.querySelectorAll('h1').length;
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]);
      out.headingSkips = hs.filter((l, i) => i && l - hs[i-1] > 1).length;
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
      out.duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
      const refs = [];
      document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]').forEach(e => ['aria-labelledby','aria-describedby','aria-controls'].forEach(a => (e.getAttribute(a)||'').split(/\\s+/).filter(Boolean).forEach(id => { if (!document.getElementById(id)) refs.push(a+'→#'+id); })));
      out.brokenAriaRefs = refs;
      out.imgsMissingAlt = [...document.images].filter(i => !i.hasAttribute('alt')).length;
      out.imgsTotal = document.images.length;
      out.imgsNoSize = [...document.images].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).length;
      out.positiveTabindex = document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length;
      const vp = document.querySelector('meta[name=viewport]')?.content || '';
      out.zoomBlocked = /user-scalable\\s*=\\s*(no|0)|maximum-scale\\s*=\\s*1(\\.0)?(\\s|,|$)/.test(vp);
      // form controls without a programmatic label
      out.unlabelledControls = [...document.querySelectorAll('input,select,textarea')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).length;
      // visually hidden labels (label exists but is clipped to 1px)
      out.hiddenLabels = [...document.querySelectorAll('label')].filter(l => { const r = l.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; }).length;
      // label in name (WCAG 2.5.3): aria-label must contain the visible text
      out.labelInNameFails = [...document.querySelectorAll('a[aria-label],button[aria-label]')].filter(e => { const v = (e.textContent||'').trim().toLowerCase(); return v && !e.getAttribute('aria-label').toLowerCase().includes(v); }).map(e => e.getAttribute('aria-label') + ' (visible: ' + e.textContent.trim() + ')');
      // links: accessible text (approximation: text content incl. visually hidden text)
      const links = [...document.querySelectorAll('a[href]')].map(a => (a.getAttribute('aria-label') || a.textContent).trim().replace(/\\s+/g,' '));
      out.linkCount = links.length;
      out.ambiguousLinks = [...new Set(links.filter((t, i) => links.indexOf(t) !== i || /^(read the story|read more|click here|more|how to listen|apply to train)$/i.test(t)))];
      out.landmarks = { header: document.querySelectorAll('header').length, nav: document.querySelectorAll('nav').length, navLabelled: document.querySelectorAll('nav[aria-label],nav[aria-labelledby]').length, main: document.querySelectorAll('main').length, footer: document.querySelectorAll('footer').length };
      out.addressElement = !!document.querySelector('address');
      out.mailtoLinks = document.querySelectorAll('a[href^=mailto]').length;
      out.autocompleteOnEmail = document.querySelector('input[type=email]')?.getAttribute('autocomplete') || null;
      out.tableRoles = document.querySelectorAll('table [role]').length;
      out.liveRegionsInDisplayNone = [...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].filter(e => getComputedStyle(e).display === 'none' ).map(e => e.id);
      out.focusableCount = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(e => e.offsetParent !== null).length;
      return out;
    }""")
    report['structure'] = s

    # ---------- target size ----------
    sizes = pg.evaluate("""() => [...document.querySelectorAll('a[href],button,input')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 1 && cs.visibility !== 'hidden' && !e.closest('.skip-link'); }).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), (e.textContent||e.id||e.type).trim().slice(0,24)]; })""")
    small = [x for x in sizes if x[0] < 24 or x[1] < 24]
    report['targets'] = {'checked': len(sizes), 'under24px': small, 'smallest': min(sizes, key=lambda x: min(x[0], x[1]))}

    # ---------- reflow at 320 px ----------
    c320, p320 = open_page(320, 700)
    report['reflow320'] = p320.evaluate("document.documentElement.scrollWidth <= innerWidth")
    c320.close()

    # ---------- schedule overflow between 600 and 899 px (decides whether the table wrapper must be focusable) ----------
    ov = []
    for w in (600, 640, 700, 768, 899):
        c, q = open_page(w); ov.append((w, q.evaluate("(()=>{const e=document.querySelector('.table-scroll');return e.scrollWidth>e.clientWidth})()"))); c.close()
    report['tableScrollOverflowAt'] = [w for w, o in ov if o]

    # ---------- text contrast (pixel-based, so text over the hero image/gradient is measured too) ----------
    def contrast_audit(width):
        ctx, pg = open_page(width, 900)
        pg.evaluate("document.querySelector('.to-top').hidden = false")
        items = pg.evaluate("""() => {
          const out = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const seen = new Set();
          while (walker.nextNode()) {
            const t = walker.currentNode; if (!t.textContent.trim()) continue;
            const el = t.parentElement; if (seen.has(el) || el.closest('script,style,noscript')) continue;
            const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
            let clipped = false; for (let n = el; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.position === 'absolute' && parseFloat(c.width) <= 1 && parseFloat(c.height) <= 1) clipped = true; }
            if (clipped) continue;   // visually hidden text is for screen readers, not for contrast
            const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect();
            if (b.width < 3 || b.height < 3 || b.right < 0 || b.left < 0) continue;   // also skips the off-screen skip link
            seen.add(el);
            out.push({ tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), text: t.textContent.trim().slice(0, 28), color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height });
          }
          return out;
        }""")
        pg.add_style_tag(content='*{color:transparent!important;text-shadow:none!important;caret-color:transparent!important} ::placeholder{color:transparent!important} svg{visibility:hidden!important}')
        pg.wait_for_timeout(200)
        img = np.asarray(Image.open(io.BytesIO(pg.screenshot(full_page=True))).convert('RGB'))
        worst = []
        for it in items:
            rgb, a = parse(it['color'])
            x0, y0 = int(it['x']), int(it['y']); x1, y1 = int(it['x'] + it['w']), int(it['y'] + it['h'])
            crop = img[max(y0, 0):y1, max(x0, 0):x1]
            if crop.size == 0: continue
            bl = lum(crop)
            r = ratio(lum(np.array(rgb)), bl)
            val = float(r.min())           # the worst pixel behind the text
            large = it['size'] >= 24 or (it['size'] >= 18.66 and it['weight'] >= 700)
            need = 3.0 if large else 4.5
            worst.append((round(val, 2), need, it['tag'], it['text']))
        ctx.close()
        fails = [w for w in worst if w[0] < w[1]]
        return {'textBlocks': len(worst), 'failing': fails, 'lowest': sorted(worst)[:3]}
    report['contrast_1280'] = contrast_audit(1280)
    report['contrast_375'] = contrast_audit(375)

    # ---------- focus indicator contrast (measured from rendered pixels) ----------
    def focus_audit(width):
        ctx, pg = open_page(width, 900, q='')
        pg.add_style_tag(content='html{scroll-behavior:auto!important}')
        results = []
        n = pg.evaluate("document.querySelectorAll('a[href],button,input').length")
        pg.evaluate("window.scrollTo(0,0)"); pg.evaluate("document.activeElement.blur()")
        seen = set()
        for _ in range(n + 6):
            pg.keyboard.press('Tab'); pg.wait_for_timeout(60)
            info = pg.evaluate("""() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
              if (r.width < 2) return null; return { key: e.tagName + (e.id || e.className || e.textContent.trim().slice(0,14)), x: r.left, y: r.top, w: r.width, h: r.height, ow: cs.outlineWidth, os: cs.outlineStyle, vw: innerWidth, vh: innerHeight }; }""")
            if not info or info['key'] in seen: continue
            seen.add(info['key'])
            img = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert('RGB'))
            x, y, w, h = info['x'], info['y'], info['w'], info['h']
            # sample a point on the ring (4.5px out from the border box) and just outside it (9px out), along whichever edge has room
            # edge directions: (dx, dy). The indicator band is 0-6px outside the box (outline-offset 3 + width 3,
            # or a halo for the back-to-top button), so take the best contrast over that band against the pixel 10px out.
            for dx, dy in ((-1, 0), (0, -1), (0, 1), (1, 0)):
                px = lambda d: (x + w / 2 + dx * (w / 2 + d), y + h / 2 + dy * (h / 2 + d))
                pts = [px(d) for d in (1.5, 4.5, 10)]
                if all(0 <= a < info['vw'] - 1 and 0 <= c < info['vh'] - 1 for a, c in pts):
                    out = img[int(pts[2][1]), int(pts[2][0])]
                    best = max(float(ratio(lum(img[int(c), int(a)]), lum(out))) for a, c in pts[:2])
                    results.append((info['key'][:22], round(best, 2)))
                    break
        ctx.close(); return results
    fa = focus_audit(1280) + focus_audit(375)
    report['focus'] = {'measured': len(fa), 'below3': [f for f in fa if f[1] < 3.0], 'lowest': sorted(fa, key=lambda f: f[1])[:3]}
    b.close()

print(json.dumps(report, indent=1, default=str))
