/* =====================================================================
   SwissRailData Wagenliste – Hintergrund-Dienst (Service Worker)
   1. Offline: App und Bibliotheken werden auf dem Gerät zwischengespeichert.
   2. Benachrichtigungen: zeigt Meldungen der Kollegen an.
   ===================================================================== */
const APP_CACHE = "wagenliste-app-v1";
const LIB_CACHE = "wagenliste-lib-v1";
const APP_DATEIEN = ["./", "./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-512.png", "./favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("wagenliste-") && k !== APP_CACHE && k !== LIB_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Datenbank-Zugriffe nie zwischenspeichern
const istDatenbank = (u) =>
  u.hostname.endsWith(".supabase.co") || /\/(rest|auth|storage|functions|realtime)\/v1\//.test(u.pathname);
// Bibliotheken, Erkennungsdaten und Schriften: einmal laden, dann vom Gerät
const istBibliothek = (u) =>
  /(^|\.)cdnjs\.cloudflare\.com$|(^|\.)cdn\.jsdelivr\.net$|(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$|tessdata/.test(u.hostname);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (istDatenbank(u)) return;

  if (u.origin === self.location.origin) {
    // App selbst: zuerst aus dem Netz (immer neueste Version), ohne Netz vom Gerät
    e.respondWith(
      fetch(req)
        .then((r) => { if (r.ok) { const k = r.clone(); caches.open(APP_CACHE).then((c) => c.put(req, k)); } return r; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    );
    return;
  }
  if (istBibliothek(u)) {
    e.respondWith(
      caches.match(req).then((treffer) => treffer || fetch(req).then((r) => {
        if (r.ok || r.type === "opaque") { const k = r.clone(); caches.open(LIB_CACHE).then((c) => c.put(req, k)); }
        return r;
      }))
    );
  }
});

// ---------- Benachrichtigungen ----------
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titel: "Wagenliste", text: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titel || "Wagenliste", {
    body: d.text || "",
    icon: "apple-touch-icon.png",
    badge: "favicon.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { liste: d.liste || null, auftrag: d.auftrag || null },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const ziel = "./" + (d.liste ? "#liste=" + encodeURIComponent(d.liste) : d.auftrag ? "#auftrag=" + encodeURIComponent(d.auftrag) : "");
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenster) => {
      for (const f of fenster) {
        if ("focus" in f) { f.postMessage({ art: "oeffnen", liste: d.liste, auftrag: d.auftrag }); return f.focus(); }
      }
      return self.clients.openWindow(ziel);
    })
  );
});
