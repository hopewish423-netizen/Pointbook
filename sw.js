// 포인트북 서비스 워커: 앱 화면은 빠르게, 최신 버전은 자동으로, 지도 타일은 일부 저장
const APP = "pb-app-v7", TILES = "pb-tiles-v1", MAX_TILES = 600;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"];
const TILE_HOSTS = ["tile.openstreetmap.org", "server.arcgisonline.com", "tile.opentopomap.org"];

self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES); const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 앱 페이지: 인터넷이 되면 항상 최신, 안 되면 저장본
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(APP).then(c => c.put("./index.html", copy)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // 지도 타일: 저장본 먼저, 없으면 받아서 저장
  if (TILE_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); trimTiles(); } return r;
    }).catch(() => fetch(req)));
    return;
  }
  // 앱 파일, 라이브러리, 글꼴: 저장본으로 빠르게 열고 뒤에서 갱신
  if (url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com" || url.hostname.endsWith("gstatic.com") || url.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.open(APP).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
  // 그 밖(장소 검색 등)은 그대로 인터넷으로
});
