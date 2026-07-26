// Minimal service worker for TODA POS PWA.
// Goal: make the app installable and resilient to flaky networks — WITHOUT
// caching dynamic API responses (those must always hit the network).

// ⚠️ Đổi biểu tượng/asset tĩnh hoặc chiến lược cache thì PHẢI tăng số bản (v3 → v4),
// nếu không máy đã cài PWA sẽ giữ mãi bản cũ. Bản 'activate' bên dưới tự xoá cache cũ.
const CACHE = "toda-pos-shell-v5";
// Chờ mạng bao lâu rồi mới chịu lấy bản đã lưu (mili-giây). Xem giải thích ở
// phần điều hướng bên dưới.
const NAV_NETWORK_TIMEOUT = 2000;
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

  // Điều hướng: ƯU TIÊN MẠNG, hết NAV_NETWORK_TIMEOUT mới lấy bản đã lưu.
  // Lưu theo ĐƯỜNG DẪN, bỏ phần "?tableId=…" để mọi bàn dùng chung một vỏ trang.
  //
  // ⚠️ Trước đây làm ngược lại (đưa bản đã lưu ra ngay rồi cập nhật ngầm) cho
  // nhanh lúc mở app lạnh. Nhưng HTML cũ trỏ tới file JS có mã băm của bản build
  // cũ — build mới XOÁ mấy file đó khỏi máy chủ → 404 → "Failed to load chunk",
  // máy POS kẹt cứng sau mỗi lần deploy (đã dính thật 2026-07-27).
  //
  // Ưu tiên mạng thì HTML luôn khớp file JS đang có trên máy chủ. Vẫn giữ hạn
  // chờ 2 giây (KHÔNG chờ vô hạn) để mạng chập chờn hay mất mạng không làm treo
  // màn hình — quán mất wifi thì app vẫn mở được bằng bản đã lưu.
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
          .catch(() => null);

        // Chưa có bản lưu nào thì đành chờ mạng — không có gì để rơi về.
        if (!cached) {
          return (await network) || caches.match("/").then((r) => r || Response.error());
        }

        const timeout = new Promise((resolve) =>
          setTimeout(() => resolve(null), NAV_NETWORK_TIMEOUT),
        );
        // Mạng về kịp (và thành công) thì dùng bản mới; chậm quá hoặc lỗi thì
        // dùng bản đã lưu — bản mới vẫn được ghi đè ngầm cho lần mở sau.
        const winner = await Promise.race([network, timeout]);
        return winner || cached;
      }),
    );
    return;
  }

  // File tĩnh: lấy bản đã lưu trước, không có thì đi mạng rồi lưu lại.
  // Tên file có mã băm theo bản build nên không bao giờ lệch bản.
  //
  // ⚠️ CHỈ lưu phản hồi thành công. Trước đây lưu cả 404 — mà 404 chính là thứ
  // xảy ra khi HTML cũ đòi file JS bản cũ; lưu lại thì lỗi thành vĩnh viễn,
  // deploy bản mới cũng không chữa được.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
