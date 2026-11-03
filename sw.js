/* Little Space service worker: opens instantly, works offline, never touches your database traffic. */
const V = "ls-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("ls-") && k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Pages: try the network for up to 3 seconds (so updates show up), then fall back to the saved copy. */
async function page(req) {
  const c = await caches.open(V);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 3000))]);
    if (r.type === "opaqueredirect") return r;
    if (r.ok) { c.put("index.html", r.clone()); return r; }
  } catch (_) {}
  return (await c.match("index.html")) || (await c.match("./")) || Response.error();
}

self.addEventListener("fetch", e => {
  const q = e.request, u = new URL(q.url);
  /* Only our own files. Supabase, favicons, fonts and embeds go straight to the network. */
  if (q.method !== "GET" || u.origin !== location.origin) return;
  if (q.mode === "navigate") { e.respondWith(page(q)); return; }
  e.respondWith(
    caches.open(V).then(async c => {
      const hit = await c.match(q);
      const net = fetch(q).then(r => { if (r.ok) c.put(q, r.clone()); return r; }).catch(() => hit || Response.error());
      return hit || net;
    })
  );
});
