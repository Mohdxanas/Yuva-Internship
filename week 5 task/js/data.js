/* data.js — mock data + simulated network layer.
   Classic scripts (no ES modules) so the app also runs when index.html
   is opened directly from disk (file://). */
window.Orbit = window.Orbit || {};

(function (O) {
  O.products = [
    { id: "aurora-headphones", name: "Aurora Headphones", cat: "audio", price: 129, emoji: "🎧", desc: "Wireless over-ear headphones with 40-hour battery life and adaptive noise cancelling." },
    { id: "pulse-speaker", name: "Pulse Speaker", cat: "audio", price: 79, emoji: "🔊", desc: "Pocket-sized waterproof speaker that fills the room with 360° sound." },
    { id: "nova-watch", name: "Nova Watch", cat: "wearables", price: 199, emoji: "⌚", desc: "Fitness and sleep tracking with a bright always-on display and a 7-day battery." },
    { id: "lumen-lamp", name: "Lumen Desk Lamp", cat: "home", price: 49, emoji: "💡", desc: "Dimmable LED lamp with warm-to-cool colour temperature and a wireless charging base." },
    { id: "atlas-backpack", name: "Atlas Backpack", cat: "travel", price: 89, emoji: "🎒", desc: "Weather-resistant 24L backpack with a padded laptop sleeve and hidden security pocket." },
    { id: "vertex-keyboard", name: "Vertex Keyboard", cat: "home", price: 109, emoji: "⌨️", desc: "Compact mechanical keyboard with hot-swappable switches and per-key lighting." },
    { id: "echo-buds", name: "Echo Buds", cat: "audio", price: 69, emoji: "🎵", desc: "True wireless earbuds with a low-latency gaming mode and a pocketable charging case." },
    { id: "ridge-bottle", name: "Ridge Bottle", cat: "travel", price: 29, emoji: "🧴", desc: "Insulated steel bottle that keeps drinks cold for 24 hours or hot for 12." }
  ];
  O.categories = ["all", "audio", "wearables", "home", "travel"];

  /* Simulated asynchronous fetch. Resolves with fn() after a random delay;
     rejects when options.fail is set, so error handling can be demonstrated
     by visiting e.g. /products?fail=1 */
  O.fakeFetch = function (fn, opts) {
    opts = opts || {};
    const delay = opts.delay != null ? opts.delay : 250 + Math.random() * 350;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (opts.fail) return reject(new Error("Simulated network failure (503)."));
        try { resolve(fn()); } catch (e) { reject(e); }
      }, delay);
    });
  };

  O.money = function (n) { return "$" + n.toFixed(2).replace(/\.00$/, ""); };
  O.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
})(window.Orbit);
