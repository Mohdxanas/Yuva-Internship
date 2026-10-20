/* views.js — one function per route. Each returns (a Promise of)
 *   { title, html, mount(root, ctx) -> optional cleanup fn }
 * Throwing { notFound: true } renders the 404 view; any other error
 * is handled by the router's error view. */
(function (O) {
  const esc = O.esc, money = O.money;
  const reveal = function (i) { return 'class="reveal" style="--i:' + i + '"'; };

  function notFound() { const e = new Error("Not found"); e.notFound = true; return e; }

  function productCard(p, i) {
    return '<article class="card product hoverable reveal" style="--i:' + i + '">' +
      '<a href="/products/' + p.id + '" data-link aria-label="View ' + esc(p.name) + '">' +
      '<div class="thumb" aria-hidden="true">' + p.emoji + '</div></a>' +
      '<h3><a href="/products/' + p.id + '" data-link>' + esc(p.name) + '</a></h3>' +
      '<p class="muted">' + esc(p.cat) + '</p>' +
      '<div class="row"><span class="price">' + money(p.price) + '</span>' +
      '<button class="btn small" data-add="' + p.id + '">Add</button></div></article>';
  }

  /* ---------------- Home ---------------- */
  function home(ctx) {
    return O.fakeFetch(function () { return O.products.slice(0, 4); }, { fail: ctx.query.fail }).then(function (featured) {
      return {
        title: "Home",
        html:
          '<section class="hero">' +
          '<h1 ' + reveal(0) + '>Navigate without <span>reloading</span></h1>' +
          '<p ' + reveal(1) + '>Orbit is a Single Page Application simulation: client-side routing, dynamic content loading and shared state — all without a full page refresh.</p>' +
          '<div class="actions ' + 'reveal" style="--i:2">' +
          '<a class="btn" href="/products" data-link>Browse products →</a>' +
          '<a class="btn ghost" href="/about" data-link>How it works</a></div></section>' +
          '<section class="grid" style="margin-bottom:2.5rem">' +
          [["⚡", "Instant navigation", "Only the content area changes; the shell stays put."],
           ["🔗", "Real URLs", "History API keeps the address bar, back and forward buttons in sync."],
           ["🧠", "Shared state", "Cart, theme and form drafts survive navigation and reloads."]]
            .map(function (f, i) { return '<div class="card feature reveal" style="--i:' + (i + 3) + '"><div class="emoji">' + f[0] + '</div><h3>' + f[1] + '</h3><p class="muted">' + f[2] + '</p></div>'; }).join("") +
          '</section>' +
          '<h2 ' + reveal(6) + '>Featured</h2><div class="grid">' + featured.map(function (p, i) { return productCard(p, i + 7); }).join("") + '</div>'
      };
    });
  }

  /* ---------------- Products list ---------------- */
  function products(ctx) {
    return O.fakeFetch(function () { return O.products; }, { fail: ctx.query.fail }).then(function (all) {
      const cat = O.categories.indexOf(ctx.query.cat) > -1 ? ctx.query.cat : "all";
      const q = ctx.query.q || "";
      return {
        title: "Products",
        html:
          '<h1 ' + reveal(0) + '>Products</h1>' +
          '<div class="toolbar reveal" style="--i:1">' +
          '<input type="search" id="q" placeholder="Search products…" aria-label="Search products" value="' + esc(q) + '" />' +
          O.categories.map(function (c) { return '<button class="chip' + (c === cat ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>'; }).join("") +
          '</div><p class="muted" id="count" aria-live="polite"></p><div class="grid" id="grid"></div>',
        mount: function (root) {
          let activeCat = cat, query = q;
          const grid = root.querySelector("#grid"), count = root.querySelector("#count");
          function draw() {
            const list = all.filter(function (p) {
              return (activeCat === "all" || p.cat === activeCat) &&
                (!query || (p.name + " " + p.desc).toLowerCase().indexOf(query.toLowerCase()) > -1);
            });
            grid.innerHTML = list.length ? list.map(function (p, i) { return productCard(p, i); }).join("")
              : '<div class="empty card" style="grid-column:1/-1">No products match your filters. 🔍</div>';
            count.textContent = list.length + " product" + (list.length === 1 ? "" : "s");
            root.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("active", c.dataset.cat === activeCat); });
            // keep URL in sync with filter state, without a new history entry or re-render
            const params = {}; if (activeCat !== "all") params.cat = activeCat; if (query) params.q = query;
            O.router.replaceQuery(params);
          }
          function onClick(e) { const c = e.target.closest("[data-cat]"); if (c) { activeCat = c.dataset.cat; draw(); } }
          function onInput(e) { if (e.target.id === "q") { query = e.target.value.trim(); draw(); } }
          root.addEventListener("click", onClick); root.addEventListener("input", onInput);
          draw();
          return function () { root.removeEventListener("click", onClick); root.removeEventListener("input", onInput); };
        }
      };
    });
  }

  /* ---------------- Product detail (dynamic param) ---------------- */
  function productDetail(ctx) {
    return O.fakeFetch(function () {
      const p = O.products.find(function (x) { return x.id === ctx.params.id; });
      if (!p) throw notFound();
      return p;
    }, { fail: ctx.query.fail }).then(function (p) {
      return {
        title: p.name,
        html:
          '<p class="breadcrumb"><a href="/products" data-link>Products</a> / ' + esc(p.name) + '</p>' +
          '<div class="detail"><div class="thumb reveal" style="--i:0" aria-hidden="true">' + p.emoji + '</div>' +
          '<div><h1 ' + reveal(1) + '>' + esc(p.name) + '</h1>' +
          '<p ' + reveal(2) + '>' + esc(p.desc) + '</p>' +
          '<p class="price reveal" style="--i:3;font-size:1.6rem">' + money(p.price) + '</p>' +
          '<div class="reveal" style="--i:4"><button class="btn" data-add="' + p.id + '">Add to cart</button> ' +
          '<a class="btn ghost" href="/products" data-link>← Back</a></div></div></div>'
      };
    });
  }

  /* ---------------- Cart ---------------- */
  function cart() {
    return Promise.resolve({
      title: "Cart",
      html: '<h1>Your cart</h1><div id="cart-body"></div>',
      mount: function (root) {
        const body = root.querySelector("#cart-body");
        function draw() {
          const items = Object.entries(O.store.get().cart).map(function (e) {
            return { p: O.products.find(function (x) { return x.id === e[0]; }), qty: e[1] };
          }).filter(function (i) { return i.p; });
          if (!items.length) {
            body.innerHTML = '<div class="empty card">Your cart is empty. 🛒<br><br><a class="btn" href="/products" data-link>Shop products</a></div>';
            return;
          }
          const total = items.reduce(function (s, i) { return s + i.p.price * i.qty; }, 0);
          body.innerHTML = '<div class="card">' + items.map(function (i) {
            return '<div class="cart-row"><span style="font-size:2rem">' + i.p.emoji + '</span>' +
              '<div class="grow"><strong>' + esc(i.p.name) + '</strong><div class="muted">' + money(i.p.price) + ' each</div></div>' +
              '<button class="btn ghost small" data-dec="' + i.p.id + '" aria-label="Decrease">−</button>' +
              '<strong aria-live="polite">' + i.qty + '</strong>' +
              '<button class="btn ghost small" data-inc="' + i.p.id + '" aria-label="Increase">+</button>' +
              '<button class="btn ghost small" data-del="' + i.p.id + '" aria-label="Remove">✕</button></div>';
          }).join("") + '<div class="total">Total: ' + money(total) + '</div></div>' +
            '<p style="text-align:right;margin-top:1rem"><button class="btn ghost" data-clear>Clear cart</button></p>';
        }
        function onClick(e) {
          const s = O.store, cartState = s.get().cart, t = e.target;
          if (t.dataset.inc) s.setQty(t.dataset.inc, cartState[t.dataset.inc] + 1);
          else if (t.dataset.dec) s.setQty(t.dataset.dec, cartState[t.dataset.dec] - 1);
          else if (t.dataset.del) s.setQty(t.dataset.del, 0);
          else if (t.hasAttribute("data-clear")) s.clearCart();
        }
        root.addEventListener("click", onClick);
        const unsub = O.store.subscribe(draw);   // re-render when state changes
        draw();
        return function () { root.removeEventListener("click", onClick); unsub(); };
      }
    });
  }

  /* ---------------- About ---------------- */
  function about() {
    const steps = [
      ["Intercept", "Clicks on [data-link] anchors are caught and default navigation is cancelled."],
      ["Update the URL", "history.pushState() changes the address bar without a request."],
      ["Resolve the route", "The path is matched against route patterns such as /products/:id."],
      ["Load the view", "An async handler fetches data and builds the HTML."],
      ["Render", "The content container is swapped with a transition; title, focus and scroll are updated."],
      ["Back / forward", "The popstate event re-renders the right view for the restored URL."]
    ];
    return Promise.resolve({
      title: "About",
      html: '<h1 ' + reveal(0) + '>How Orbit works</h1><p class="muted reveal" style="--i:1">The life of a navigation:</p>' +
        '<ol class="timeline">' + steps.map(function (s, i) { return '<li class="reveal" style="--i:' + (i + 2) + '"><strong>' + s[0] + '.</strong> ' + s[1] + '</li>'; }).join("") + '</ol>' +
        '<div class="card reveal" style="--i:9"><h3>Try it</h3><p class="muted">Test error handling: <a href="/products?fail=1" data-link>/products?fail=1</a> (simulated server error) or <a href="/nowhere" data-link>/nowhere</a> (404).</p></div>'
    });
  }

  /* ---------------- Contact (form validation + leave guard) ---------------- */
  function contact() {
    const d = O.store.get().draft;
    return Promise.resolve({
      title: "Contact",
      html:
        '<h1 ' + reveal(0) + '>Contact us</h1>' +
        '<form id="form" class="card reveal" style="--i:1;max-width:560px" novalidate>' +
        '<div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name" value="' + esc(d.name) + '" /><div class="error-msg" data-for="name"></div></div>' +
        '<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" value="' + esc(d.email) + '" /><div class="error-msg" data-for="email"></div></div>' +
        '<div class="field"><label for="message">Message</label><textarea id="message" name="message" rows="5">' + esc(d.message) + '</textarea><div class="error-msg" data-for="message"></div></div>' +
        '<button class="btn" type="submit" id="send">Send message</button> <span class="muted" id="draft-note"></span></form>',
      mount: function (root) {
        const form = root.querySelector("#form"), note = root.querySelector("#draft-note");
        const rules = {
          name: function (v) { return v.trim().length >= 2 ? "" : "Please enter your name (2+ characters)."; },
          email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Please enter a valid email address."; },
          message: function (v) { return v.trim().length >= 10 ? "" : "Message must be at least 10 characters."; }
        };
        function validateField(name) {
          const msg = rules[name](form.elements[name].value);
          form.querySelector('[data-for="' + name + '"]').textContent = msg;
          form.elements[name].closest(".field").classList.toggle("invalid", !!msg);
          return !msg;
        }
        function onInput(e) {
          const v = form.elements;
          O.store.set({ draft: { name: v.name.value, email: v.email.value, message: v.message.value }, dirty: true });
          note.textContent = "Draft saved";
          if (e.target.closest(".field").classList.contains("invalid")) validateField(e.target.name);
        }
        form.addEventListener("input", onInput);
        form.addEventListener("focusout", function (e) { if (e.target.name && e.target.value) validateField(e.target.name); });

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          const ok = Object.keys(rules).map(validateField).every(Boolean);
          if (!ok) { form.querySelector(".invalid input, .invalid textarea").focus(); return; }
          const btn = form.querySelector("#send");
          btn.disabled = true; btn.textContent = "Sending…";
          O.fakeFetch(function () { return true; }, { delay: 900 }).then(function () {
            O.store.set({ draft: { name: "", email: "", message: "" }, dirty: false });
            O.toast("Thanks! Your message was sent ✔");
            O.router.navigate("/");
          }).catch(function () {
            btn.disabled = false; btn.textContent = "Send message";
            O.toast("Could not send. Try again.", true);
          });
        });

        // Navigation guard: warn when leaving with unsent text
        const off = O.router.beforeLeave(function () {
          const s = O.store.get();
          if (!s.dirty) return true;
          return window.confirm("You have an unsent message (saved as a draft). Leave this page?");
        });
        return function () { off(); O.store.set({ dirty: false }); };
      }
    });
  }

  /* ---------------- 404 and error views ---------------- */
  function notFoundView(ctx) {
    return Promise.resolve({
      title: "Page not found",
      html: '<div class="notfound"><div class="big">404</div><h2>We couldn\'t find that page</h2>' +
        '<p class="muted">No route matches <code>' + esc(ctx.path) + '</code>.</p>' +
        '<a class="btn" href="/" data-link>Go home</a></div>'
    });
  }
  function errorView(err, ctx) {
    return Promise.resolve({
      title: "Something went wrong",
      html: '<div class="notfound" role="alert"><div class="big">⚠️</div><h2>Something went wrong</h2>' +
        '<p class="muted">' + esc(err && err.message || "Unknown error") + '</p>' +
        '<button class="btn" id="retry">Try again</button> <a class="btn ghost" href="/" data-link>Go home</a></div>',
      mount: function (root) {
        const b = root.querySelector("#retry");
        function retry() { O.router.navigate(ctx.path, { force: true }); }  // drops ?fail to recover
        b.addEventListener("click", retry);
      }
    });
  }

  O.views = { home: home, products: products, productDetail: productDetail, cart: cart, about: about, contact: contact, notFound: notFoundView, error: errorView };
})(window.Orbit);
