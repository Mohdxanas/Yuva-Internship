# Orbit SPA

A small Single Page Application built with plain HTML, CSS and JavaScript (no frameworks, no build step). Content is loaded dynamically and the URL is kept in sync using the History API, so navigation never triggers a full page reload.

## Run it

**Option A — recommended (supports deep links and refresh on any route):**

```bash
python3 server.py        # then open http://localhost:8000
```

**Option B — any static server with SPA fallback** (e.g. `npx serve -s .`).

**Option C — double-click `index.html`.** On `file://` the router automatically switches to hash mode (`index.html#/products`) because the History API cannot create real paths there.

## Structure

```
spa-project/
├── index.html        main container (header, nav, <main id="view">, footer)
├── css/styles.css    design tokens, layout, transitions, dark mode, responsive
├── js/
│   ├── data.js       mock products + simulated async fetch
│   ├── store.js      observable state (cart, theme, form draft) + localStorage
│   ├── router.js     History API router (patterns, guards, 404/error, scroll/focus)
│   ├── views.js      one async view function per route
│   └── app.js        bootstrap: routes, theme, cart badge, toast, mobile menu
├── server.py         dev server with SPA fallback
├── REPORT.md         technical report
└── README.md
```

## Routes

| Path | View |
|------|------|
| `/` | Home |
| `/products` | Product list with search and category filter (`?cat=audio&q=...`) |
| `/products/:id` | Product detail (dynamic parameter) |
| `/cart` | Cart (live-updating from shared state) |
| `/about` | How navigation works |
| `/contact` | Validated form with draft saving and leave-guard |
| anything else | 404 view |

Try error handling: `/products?fail=1` (simulated server error with retry) and `/nowhere` (404).
