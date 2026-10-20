/* store.js — tiny observable state container with localStorage persistence. */
(function (O) {
  const KEY = "orbit-spa-state-v1";
  const persisted = ["theme", "cart", "draft"];

  const state = {
    theme: null,       // "light" | "dark"; null = follow OS
    cart: {},          // { productId: quantity }
    draft: { name: "", email: "", message: "" }, // contact form draft
    dirty: false       // transient: unsaved form changes (not persisted)
  };
  const listeners = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    persisted.forEach(function (k) { if (saved[k] !== undefined) state[k] = saved[k]; });
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }

  function save() {
    try {
      const out = {};
      persisted.forEach(function (k) { out[k] = state[k]; });
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (e) { /* ignore quota / private mode */ }
  }

  O.store = {
    get: function () { return state; },
    set: function (patch) {
      Object.assign(state, patch);
      save();
      listeners.forEach(function (fn) { fn(state); });
    },
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },

    // cart helpers
    addToCart: function (id) {
      const cart = Object.assign({}, state.cart);
      cart[id] = (cart[id] || 0) + 1;
      this.set({ cart: cart });
    },
    setQty: function (id, qty) {
      const cart = Object.assign({}, state.cart);
      if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, 99);
      this.set({ cart: cart });
    },
    clearCart: function () { this.set({ cart: {} }); },
    cartCount: function () {
      return Object.values(state.cart).reduce(function (a, b) { return a + b; }, 0);
    }
  };
})(window.Orbit);
