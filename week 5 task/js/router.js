/* router.js — client-side router built on the History API.
 *
 * - History mode (pushState/popstate) on http(s); automatic hash-mode
 *   fallback on file:// where pushState with real paths cannot work.
 * - Route patterns with params:  "/products/:id"
 * - Async route handlers, with a navigation token so slow, stale
 *   responses can never overwrite a newer navigation (race protection).
 * - Leave guards (e.g. unsaved form), 404 + error views, scroll
 *   restoration, focus management and document.title updates.
 */
(function (O) {
  const useHash = location.protocol === "file:";
  const routes = [];
  const guards = [];
  let notFoundHandler = null;
  let errorHandler = null;
  let token = 0;            // increments on every navigation
  let currentUrl = null;    // "/path?query" currently displayed
  let rootEl, progressEl;
  const scrollPositions = {}; // key -> scrollY, for back/forward restoration

  /* ---------- helpers ---------- */
  function compile(pattern) {
    const keys = [];
    const src = pattern.replace(/\/:([^/]+)/g, function (_, k) { keys.push(k); return "/([^/]+)"; });
    return { re: new RegExp("^" + src + "/?$"), keys: keys };
  }

  function readLocation() {
    let raw = useHash ? (location.hash.slice(1) || "/") : location.pathname + location.search;
    const i = raw.indexOf("?");
    const path = (i === -1 ? raw : raw.slice(0, i)) || "/";
    const query = {};
    new URLSearchParams(i === -1 ? "" : raw.slice(i)).forEach(function (v, k) { query[k] = v; });
    return { path: path, query: query, url: raw };
  }

  function toHref(url) { return useHash ? "#" + url : url; }

  function match(path) {
    for (let i = 0; i < routes.length; i++) {
      const m = routes[i].re.exec(path);
      if (m) {
        const params = {};
        routes[i].keys.forEach(function (k, idx) { params[k] = decodeURIComponent(m[idx + 1]); });
        return { route: routes[i], params: params };
      }
    }
    return null;
  }

  function progress(state) {
    if (!progressEl) return;
    progressEl.className = "progress" + (state ? " " + state : "");
  }

  /* ---------- rendering ---------- */
  async function render(loc, opts) {
    const myToken = ++token;
    const found = match(loc.path);
    const ctx = { path: loc.path, query: loc.query, params: found ? found.params : {}, url: loc.url };

    // 1. animate old content out and start the progress bar
    progress("loading");
    rootEl.classList.remove("entering");
    rootEl.classList.add("leaving");
    const minWait = new Promise(function (r) { setTimeout(r, 160); });

    let view;
    try {
      // 2. load the new view (may be async: network, lazy data...)
      const loader = found ? found.route.handler(ctx) : notFoundHandler(ctx);
      view = await Promise.all([loader, minWait]).then(function (r) { return r[0]; });
    } catch (err) {
      if (myToken !== token) return;               // superseded, ignore
      view = err && err.notFound ? notFoundHandler(ctx) : errorHandler(err, ctx);
      view = await view;
    }
    if (myToken !== token) return;                  // a newer navigation won the race

    // 3. swap content
    if (typeof rootEl._cleanup === "function") { rootEl._cleanup(); rootEl._cleanup = null; }
    rootEl.innerHTML = view.html;
    rootEl.classList.remove("leaving");
    void rootEl.offsetWidth;                        // restart CSS animation
    rootEl.classList.add("entering");
    progress("done");
    setTimeout(function () { if (myToken === token) progress(""); }, 350);

    // 4. side effects: title, nav highlight, mount hooks, scroll, focus
    document.title = (view.title ? view.title + " · " : "") + "Orbit SPA";
    currentUrl = loc.url;
    updateActiveLinks(loc.path);
    const info = document.getElementById("route-info");
    if (info) info.textContent = "Current route: " + loc.path + (useHash ? " (hash mode)" : " (History API)");
    if (typeof view.mount === "function") rootEl._cleanup = view.mount(rootEl, ctx) || null;

    if (opts && opts.restoreScroll != null) window.scrollTo(0, opts.restoreScroll);
    else window.scrollTo(0, 0);
    rootEl.focus({ preventScroll: true });          // a11y: move focus to the new view
    document.dispatchEvent(new CustomEvent("route:changed", { detail: ctx }));
  }

  function updateActiveLinks(path) {
    document.querySelectorAll(".nav a[data-link]").forEach(function (a) {
      const target = a.getAttribute("href").replace(/^#/, "").split("?")[0] || "/";
      const active = target === "/" ? path === "/" : path === target || path.indexOf(target + "/") === 0;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function allowLeave() {
    for (let i = 0; i < guards.length; i++) { if (guards[i]() === false) return false; }
    return true;
  }

  /* ---------- public API ---------- */
  const router = {
    add: function (pattern, handler) { const c = compile(pattern); routes.push({ re: c.re, keys: c.keys, handler: handler }); return router; },
    notFound: function (h) { notFoundHandler = h; return router; },
    onError: function (h) { errorHandler = h; return router; },
    beforeLeave: function (fn) { guards.push(fn); return function () { guards.splice(guards.indexOf(fn), 1); }; },
    isHashMode: useHash,

    navigate: function (url, opts) {
      opts = opts || {};
      if (url === currentUrl && !opts.force) return;      // already here
      if (!allowLeave()) return;
      scrollPositions[history.state && history.state.key] = window.scrollY;
      const state = { key: Date.now() + "" };
      if (useHash) {
        // hash mode: changing location.hash fires "hashchange", which renders.
        // Keep our own key bookkeeping by replacing state afterwards.
        if (opts.replace) location.replace(toHref(url)); else location.hash = url;
        return;
      }
      if (opts.replace) history.replaceState(state, "", url); else history.pushState(state, "", url);
      render(readLocation());
    },

    /* Update only the query string (e.g. filters) without re-rendering the view. */
    replaceQuery: function (params) {
      const loc = readLocation();
      const qs = new URLSearchParams(params).toString();
      const url = loc.path + (qs ? "?" + qs : "");
      currentUrl = url;
      if (useHash) history.replaceState(history.state, "", "#" + url);
      else history.replaceState(history.state, "", url);
    },

    start: function (root, progressBar) {
      rootEl = root; progressEl = progressBar;

      // Intercept clicks on internal links ([data-link]) so no full reload happens.
      document.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest("a[data-link]");
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute("href").replace(/^#/, "");
        router.navigate(href);
      });

      // Back / forward buttons
      window.addEventListener("popstate", function () {
        if (useHash) return;
        if (!allowLeave()) {                       // guard refused: undo the history move
          history.pushState(history.state, "", currentUrl);
          return;
        }
        const key = history.state && history.state.key;
        render(readLocation(), { restoreScroll: scrollPositions[key] });
      });

      if (useHash) {
        window.addEventListener("hashchange", function () {
          if (readLocation().url === currentUrl) return;   // our own revert, nothing to do
          if (!allowLeave()) { location.replace("#" + currentUrl); return; }
          render(readLocation());
        });
      }

      // Initial render. Replace current entry so it carries a key.
      if (!useHash) history.replaceState({ key: "initial" }, "", location.pathname + location.search);
      render(readLocation());
    }
  };

  O.router = router;
})(window.Orbit);
