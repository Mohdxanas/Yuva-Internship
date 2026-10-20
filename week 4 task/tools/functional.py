"""Functional + accessibility-behaviour tests (Playwright). Run against a URL; prints PASS/FAIL per check."""
import sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]
res = []
def check(name, ok, extra=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    def new(w=375, h=812, js=True, rm=True, q=''):
        ctx = b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce' if rm else 'no-preference', java_script_enabled=js)
        pg = ctx.new_page(); pg.route('**/fonts.*/**', lambda r: r.abort())
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + q, wait_until='load'); pg.wait_for_timeout(500); return ctx, pg, errs

    # --- mobile ---
    ctx, pg, errs = new()
    check('no JavaScript errors on load', not errs, '; '.join(errs))
    btn = pg.locator('.nav-button')
    check('menu closed at start', btn.get_attribute('aria-expanded') == 'false' and not pg.locator('#main-nav').is_visible())
    btn.click(); check('menu opens', btn.get_attribute('aria-expanded') == 'true' and pg.locator('#main-nav').is_visible())
    pg.keyboard.press('Escape')
    check('Escape closes menu and returns focus to button', btn.get_attribute('aria-expanded') == 'false' and pg.evaluate("document.activeElement.classList.contains('nav-button')"))
    btn.click(); pg.locator('#main-nav a[href="#schedule"]').click(); pg.wait_for_timeout(300)
    check('link click closes menu', btn.get_attribute('aria-expanded') == 'false')
    check('no horizontal scroll at 375px', pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))

    # search
    pg.fill('#show-search', 'news'); pg.wait_for_timeout(700)
    vis = pg.locator('.card:visible').count()
    check('search "news" -> 1 card', vis == 1, f'{vis}')
    check('search announces count only after a pause', 'match' in pg.inner_text('#show-status'), pg.inner_text('#show-status'))
    pg.fill('#show-search', 'zzzz'); pg.wait_for_timeout(100)
    check('empty-state message shows', pg.locator('#no-shows').is_visible())
    pg.fill('#show-search', ''); check('clearing search restores 4 cards', pg.locator('.card:visible').count() == 4)

    # schedule
    ctx2, pg2, _ = new(q='?time=17:30')
    check('on-air banner at 17:30 names Mohalla Mic', 'Mohalla Mic' in pg2.inner_text('#on-air-text'), pg2.inner_text('#on-air-text'))
    check('exactly one row highlighted', pg2.locator('tr.is-live').count() == 1)
    pg2.click('.chip[data-filter="urdu"]')
    check('Urdu filter leaves 1 row', pg2.locator('tbody tr:visible').count() == 1)
    check('pressed chip has aria-pressed=true', pg2.get_attribute('.chip[data-filter="urdu"]', 'aria-pressed') == 'true')
    pg2.click('.chip[data-filter="all"]'); check('All restores 5 rows', pg2.locator('tbody tr:visible').count() == 5)
    check('table keeps its semantics (roles present)', pg2.locator('table[role=table] tr[role=row]').count() == 6)

    # form
    f = pg
    f.fill('#email', ''); f.click('.signup button'); 
    check('empty submit shows error text', 'Enter your email' in f.inner_text('#email-error'))
    check('focus moves to the email field', f.evaluate("document.activeElement.id") == 'email')
    check('aria-invalid set', f.get_attribute('#email', 'aria-invalid') == 'true')
    f.fill('#email', 'bad@x'); check('bad email shows format error', 'incomplete' in f.inner_text('#email-error'))
    f.fill('#email', 'me@example.com'); check('error clears live while typing', f.inner_text('#email-error') == '')
    f.click('.signup button'); f.wait_for_timeout(1000)
    check('valid submit shows confirmation', 'Thank you' in f.inner_text('#form-status'))
    check('email field has autocomplete=email and a visible label', f.get_attribute('#email', 'autocomplete') == 'email' and f.locator('label[for=email]').is_visible())

    # keyboard: skip link is first tab stop and works
    ctx3, k, _ = new(w=1280, h=800)
    k.keyboard.press('Tab')
    check('first Tab stop is the skip link', k.evaluate("document.activeElement.className") == 'skip-link')
    k.keyboard.press('Enter'); k.wait_for_timeout(200)
    check('skip link moves focus into <main>', k.evaluate("document.activeElement.id") == 'main')
    check('desktop: menu inline, hamburger hidden', k.locator('#main-nav').is_visible() and not k.locator('.nav-button').is_visible())
    k.evaluate("document.getElementById('schedule').scrollIntoView()"); k.wait_for_timeout(500)
    cur = k.evaluate("document.querySelector('.nav-link[aria-current]')?.textContent")
    check('scroll spy marks Schedule (aria-current=location)', cur == 'Schedule' and k.get_attribute('.nav-link[aria-current]', 'aria-current') == 'location', str(cur))
    k.evaluate("window.scrollTo(0, 0)"); k.wait_for_timeout(300)
    k.evaluate("window.scrollTo(0, 2000)"); k.wait_for_timeout(500)
    check('back-to-top button appears', k.locator('.to-top').is_visible())
    k.click('.to-top'); k.wait_for_timeout(400)
    check('back-to-top returns to top', k.evaluate("scrollY") == 0)

    # no JS
    ctx4, nj, _ = new(js=False)
    check('no-JS: nav links visible, content visible', nj.locator('#main-nav a').first.is_visible() and nj.locator('.card').first.is_visible() and nj.locator('tbody tr').count() == 5)
    check('no-JS: hamburger/search/filters not shown', not nj.locator('.nav-button').is_visible() and not nj.locator('.search').is_visible() and not nj.locator('.filters').is_visible())
    check('no-JS: form keeps native validation (required)', nj.get_attribute('#email', 'required') is not None)
    check('no-JS: stylesheet still applies (noscript fallback)', nj.evaluate("getComputedStyle(document.querySelector('.card')).borderTopWidth") == '1px')

    # reduced motion
    ctx5, rm, _ = new(rm=True)
    check('reduced motion: nothing stays hidden', rm.evaluate("[...document.querySelectorAll('.reveal')].every(e=>getComputedStyle(e).opacity==='1')") or rm.locator('.reveal').count() == 0)
    b.close()
print(f'\n{sum(res)}/{len(res)} checks passed')
