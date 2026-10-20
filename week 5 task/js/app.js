/* app.js — bootstrap: registers routes, wires global UI (theme, cart badge,
   mobile menu, toast, add-to-cart) and starts the router. */
(function (O) {
  const $ = function (s) { return document.querySelector(s); };

  /* ----- toast ----- */
  let toastTimer;
  O.toast = function (msg, isError) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  };

  /* ----- theme ----- */
  function applyTheme() {
    const saved = O.store.get().theme;
    const theme = saved || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  }
  $("#theme-toggle").addEventListener("click", function () {
    const cur = document.documentElement.getAttribute("data-theme");
    O.store.set({ theme: cur === "dark" ? "light" : "dark" });
  });

  /* ----- cart badge ----- */
  let lastCount = null;
  function updateBadge() {
    const el = $("#cart-count"), n = O.store.cartCount();
    el.textContent = n;
    if (lastCount !== null && n > lastCount) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    lastCount = n;
  }
  O.store.subscribe(function () { applyTheme(); updateBadge(); });
  applyTheme(); updateBadge();

  /* ----- global "Add to cart" buttons (event delegation) ----- */
  document.addEventListener("click", function (e) {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    O.store.addToCart(b.dataset.add);
    const p = O.products.find(function (x) { return x.id === b.dataset.add; });
    O.toast((p ? p.name : "Item") + " added to cart");
  });

  /* ----- mobile menu ----- */
  const toggle = $("#nav-toggle"), nav = $("#nav");
  toggle.addEventListener("click", function () {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("route:changed", function () {
    nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); } });

  /* ----- skip link (a plain #view href would resolve against <base>) ----- */
  $(".skip-link").addEventListener("click", function (e) { e.preventDefault(); $("#view").focus(); });

  /* ----- routes ----- */
  O.router
    .add("/", O.views.home)
    .add("/products", O.views.products)
    .add("/products/:id", O.views.productDetail)
    .add("/cart", O.views.cart)
    .add("/about", O.views.about)
    .add("/contact", O.views.contact)
    .notFound(O.views.notFound)
    .onError(O.views.error)
    .start($("#view"), $("#progress"));
})(window.Orbit);
