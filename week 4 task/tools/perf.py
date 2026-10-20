"""Throttled page-load measurement with Playwright/Chromium (CDP).
Simulates: slow 4G (1.6 Mbps, 150 ms RTT), 4x CPU slowdown, and Google Fonts answering after 400 ms
(the sandbox has no internet, so the font request is simulated with a delayed stub stylesheet)."""
import json, statistics, subprocess, sys, time
from playwright.sync_api import sync_playwright

def measure(url, runs=5, mobile=True):
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for _ in range(runs):
            ctx = b.new_context(viewport={'width': 375, 'height': 812} if mobile else {'width': 1280, 'height': 800},
                                device_scale_factor=1)
            page = ctx.new_page()
            def fonts(route):
                time.sleep(float(__import__("os").environ.get("FONT_DELAY", "0.4")))
                if 'googleapis' in route.request.url:
                    route.fulfill(status=200, content_type='text/css', body='/* stub */')
                else:
                    route.fulfill(status=200, body=b'')
            page.route('**/fonts.googleapis.com/**', fonts)
            page.route('**/fonts.gstatic.com/**', fonts)
            cdp = ctx.new_cdp_session(page)
            cdp.send('Network.enable')
            cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150,
                     'downloadThroughput': 1.6e6 / 8, 'uploadThroughput': 750e3 / 8})
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
            reqs = {}
            cdp.on('Network.responseReceived', lambda e: reqs.setdefault(e['requestId'], {}).update(url=e['response']['url'], type=e['type']))
            cdp.on('Network.loadingFinished', lambda e: reqs.setdefault(e['requestId'], {}).update(bytes=e['encodedDataLength']))
            page.add_init_script("""
              window.__m={cls:0,lcp:0,fcp:0};
              new PerformanceObserver(l=>{for(const e of l.getEntries()) if(e.name==='first-contentful-paint') window.__m.fcp=e.startTime}).observe({type:'paint',buffered:true});
              new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__m.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});
              new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__m.cls+=e.value}).observe({type:'layout-shift',buffered:true});
            """)
            page.goto(url, wait_until='load')
            page.wait_for_timeout(1200)
            m = page.evaluate('window.__m')
            local = [r for r in reqs.values() if r.get('url', '').startswith('http://127.0.0.1')]
            m['requests'] = len(local)
            m['bytes'] = sum(r.get('bytes', 0) for r in local)
            m['blocking'] = page.evaluate("performance.getEntriesByType('resource').filter(r=>r.renderBlockingStatus==='blocking').length")
            out.append(m); ctx.close()
        b.close()
    med = lambda k: round(statistics.median(x[k] for x in out), 3 if k == 'cls' else 0)
    return {k: med(k) for k in ('fcp', 'lcp', 'cls', 'requests', 'bytes', 'blocking')}

if __name__ == '__main__':
    print(json.dumps(measure(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 5)))
