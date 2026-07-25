// Minimal service worker for TODA POS PWA.
// Goal: make the app installable and resilient to flaky networks — WITHOUT
// caching dynamic API responses (those must always hit the network).

// ⚠️ Đổi biểu tượng/asset tĩnh hoặc chiến lược cache thì PHẢI tăng số bản (v3 → v4),
// nếu không máy đã cài PWA sẽ giữ mãi bản cũ. Bản 'activate' bên dưới tự xoá cache cũ.
const CACHE = "toda-pos-shell-v4";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API / websocket / cross-origin (e.g. the Hono API on :3001).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Dữ liệu trang của Next (?_rsc=…): URL KHÔNG đổi theo bản build, cache lại là kẹt
  // bản cũ sau mỗi lần deploy → luôn đi mạng.
  if (url.searchParams.has("_rsc")) return;

  // Điều hướng: hiện ngay bản đã lưu rồi cập nhật ngầm (stale-while-revalidate).
  // Trước đây luôn chờ mạng nên máy POS mở app lạnh phải đợi mạng xong mới vẽ được gì.
  // Lưu theo ĐƯỜNG DẪN, bỏ phần "?tableId=…" để mọi bàn dùng chung một vỏ trang.
  if (req.mode === "navigate") {
    const shellKey = url.origin + url.pathname;
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(shellKey);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(shellKey, res.clone());
            return res;
          })
          .catch(() => cached || caches.match("/").then((r) => r || Response.error()));
        return cached || network;
      }),
    );
    return;
  }

  // Static assets: cache-first, then network (and populate cache).
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        }),
    ),
  );
});
