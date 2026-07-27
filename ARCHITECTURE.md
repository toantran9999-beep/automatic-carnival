# ARCHITECTURE.md — Bản đồ codebase TODA POS

> Mục đích: đọc file này thay vì quét cả code mỗi lần. Khi sửa, ĐỌC file này trước rồi nhảy
> thẳng tới file liên quan. Kèm theo [AGENTS.md](AGENTS.md) (quy trình git/deploy) và
> [DEPLOY.md](DEPLOY.md) (hướng dẫn dựng VPS). **Cập nhật file này mỗi khi thêm tính năng/đổi cấu trúc.**

## 1. Stack & hạ tầng

- **Monorepo** Bun + Turborepo. `apps/api` (Hono/Bun, :3001, WebSocket `/ws`), `apps/web` (Next.js 16 App Router, :3000), `packages/{db,validators,config,ui,types}`.
- **DB:** PostgreSQL 17 + Redis 7 (Drizzle ORM).
- **Deploy:** Docker Compose + **Caddy** (auto-HTTPS) trên VPS **14.225.212.172** (`/root/toda-pos`). Domain nip.io: web `https://pos.14.225.212.172.nip.io`, api `https://api.14.225.212.172.nip.io`.
- **Git nguồn:** GitHub `toantran9999-beep/automatic-carnival`, nhánh `master`. Quy tắc phối hợp đa-agent (Codex + Claude) ở `AGENTS.md`.

## 2. apps/api/src — Backend

| Đường dẫn | Nội dung |
|---|---|
| `index.ts` | `Bun.serve` :3001, nâng cấp WS tại `/ws`, graceful shutdown. |
| `app.ts` | Mount tất cả route Hono + CORS (`CORS_ORIGINS`) + rate-limit. |
| `routes/` | `auth, orgs, branches, menu, tables, spaces, orders, kitchen, payments, invoices, inventory, loyalty, staff, reports, settings, customer, uploads, coupons, ai-images`. |
| `services/` | `order.service` (tạo đơn + coupon + loyalty + inventory + snapshot unit), `session.service` (phiên bàn: create/approve/end), `inventory/loyalty/customer.service`. |
| `middleware/` | `auth` (JWT), `tenant` (đọc `x-branch-id` → tenant), `rbac` (`requirePermission`), `error-handler`, `rate-limit`. |
| `lib/` | `r2` (`storeUpload`/`deleteUpload` — R2 nếu cấu hình, ngược lại lưu cục bộ volume), `i18n` (`t(c,key)`), `logger`, `redis`, `id`, `timezone`. |
| `ws/` | `manager` (publish theo channel `branch:<id>`), `handlers`. |

**Quy ước route:** mỗi route tự gắn `authMiddleware + tenantMiddleware`. Phân quyền: `requirePermission("menu:read"...)`. Phạm vi chi nhánh qua header `x-branch-id`; report hỗ trợ `?allBranches=true` cho org_admin/super_admin (`reports.ts` → `resolveReportScope`).

## 3. apps/web/src — Frontend

| Khu vực | Đường dẫn |
|---|---|
| Root redirect | `app/page.tsx` (đã login → `/dashboard`, chưa → `/login`). |
| Layout gốc | `app/layout.tsx` (font **Be Vietnam Pro**, PWA manifest, script no-flash theme, đăng ký SW). |
| PWA | `app/manifest.ts`, `public/sw.js`, bộ icon `public/icon-*.png` (sinh từ `logo/logoden.png` bằng `scripts/build-brand-assets.ps1` — đổi icon thì PHẢI tăng số bản cache trong `sw.js`). |
| Theme tokens | `app/globals.css` (biến shadcn + `--accent-runtime` đổi màu nhấn runtime). |
| Dashboard layout | `app/(dashboard)/layout.tsx` — sidebar nav, **`allowedPaths` theo vai trò**, branch switcher, ThemeSwitcher, ClockNow, nút thu gọn. |
| Bảng điều khiển | `app/(dashboard)/dashboard/page.tsx` (stats từ `/api/reports/dashboard`). |
| POS | `app/(dashboard)/pos/page.tsx` + `_components/`: `product-grid`, `cart-sidebar`, `modifier-dialog`, `pos-payment-dialog`, `success-dialog`. URL: `?tableId=&pay=1` (mở thanh toán), `?takeout=1`. |
| Bàn ăn | `app/(dashboard)/tables/page.tsx` + `_components/`: `grid-view`, `table-card`, `table-operations-dialog` (gộp/tách/chuyển — Codex), `space-management`, `floor-planner-view`. |
| Thực đơn | `app/(dashboard)/menu/page.tsx` + `_components/`: `products-panel`, `product-dialog`, `category-dialog`, `modifier-groups-panel`, `modifier-group-dialog`, `image-upload-button`. |
| Khác | `orders, kitchen, inventory, staff, payments, loyalty, reports, settings, connections`. |
| Khách QR | `app/(customer)/...` — tồn tại nhưng **đã ẩn** trong luồng bàn (`showCustomerQrFlow=false`). |
| Components dùng chung | `print-ticket` (phiếu bếp + in Android), `station-provider` (nghe `order:new` → tự in tại quầy), `station-toggle` (bật/tắt Trạm quầy theo thiết bị), `theme-switcher`, `brand-logo` (logo quán, dùng ảnh gốc làm mặt nạ + `currentColor`), `clock-now`, `sw-register`, `page-header`, `confirm-dialog`. |
| Stores (Zustand) | `auth-store`, `cart-store`, `customer-store`, `lang-store`, `theme-store`, `station-store` (cờ Trạm quầy + chuông, lưu theo thiết bị). |
| Hooks | `use-menu`, `use-tables`, `use-orders`, `use-payments`, `use-reports`, `use-dashboard`, `use-settings`, `use-uploads`, `use-ai-images`, `use-kitchen/inventory/loyalty/staff/coupons`, `use-websocket`, `use-auth`. |
| Lib | `api-client`, `fetcher` (`apiFetch` tự gắn `x-branch-id`), `translations` (VI/EN), `utils` (`formatCurrency`). |

## 4. packages

- **db** — `schema/{enums,tenants,auth,tables,menu,orders,loyalty,inventory,payments,staff,coupons,register}.ts`; `drizzle/` migrations + `meta/`; `seed.ts` (⚠️ TRUNCATE toàn bộ rồi seed — KHÔNG chạy trên prod); `migrate.ts`; `setup-coffee-modifiers.ts` (script một lần dựng nhóm tùy chọn cà phê + gộp "(nhẹ)").
- **validators** — `index.ts` (zod schema cho mọi input).
- **config** — `index.ts` chứa **`PERMISSIONS`** (quyền theo vai trò) + state machine trạng thái đơn.
- **ui** — shadcn components. **types** — kiểu WS dùng chung.
- **postcss-compat** (`packages/postcss-compat/`) — plugin PostCSS nội bộ **`@restai/postcss-compat`**, hạ cấp CSS build cho WebView cũ trên máy POS Android. Chi tiết ở mục 7.

## 5. Mô hình dữ liệu — điểm cần nhớ

- Đa tenant: `organizations → branches`; mọi bảng nghiệp vụ có `branch_id` + `organization_id`. `user_branches` (n-n) gán nhân viên ↔ chi nhánh.
- `branches.settings` (jsonb) chứa flag: `print_mode` (combined/per_item), `print_driver` (browser_print/rawbt_intent/android_bridge), `inventory_enabled`, `waiter_table_assignment_enabled`.
- `menu_items.unit` (ĐVT), `order_items.unit` (snapshot). `modifiers.price` cho phép **âm** (giảm giá). `modifiers.sort_order` + `modifier_groups.sort_order` (thứ tự nhóm/tùy chọn). `menu_item_modifier_groups` = bảng nối (item ↔ nhóm).
- `table_session_events` = nhật ký gộp/tách/chuyển/void bàn (action: transfer/merge/split/void).
- Tiền lưu **cents** (×100). VAT inclusive 10% (`branches.tax_rate=1000`).

### Migrations
| File | Nội dung |
|---|---|
| 0000, 0001 | Toàn bộ schema gốc (34 bảng). |
| 0002 | `table_session_events` (Codex). |
| 0003 | `menu_items.unit` + `order_items.unit`. |
| 0004 | `modifiers.sort_order` + `order_item_modifiers.modifier_id` FK → ON DELETE SET NULL (để xóa nhóm/modifier không vướng đơn cũ). |
| 0005 | `modifier_groups.sort_order`. |
| 0006 | `payment_requests` + `payment_webhook_events` cho QR chuyển khoản tạm tính 60 phút và đối soát webhook SePay. |
| 0007 | `register_shifts` (ca bán hàng tại quầy) + unique index 1 ca mở/chi nhánh (`WHERE status='open'`). |

> ⚠️ `drizzle-kit generate` đôi khi sinh dư (re-create bảng đã có) do snapshot lệch → **rút gọn migration chỉ giữ ALTER cần thiết** + thêm `IF EXISTS/IF NOT EXISTS`.

## 6. TÍNH NĂNG đã làm (log)

- **Việt hóa** + mặc định VN (timezone Asia/Ho_Chi_Minh, VND, VAT 10%).
- **In phiếu tách/gộp** (`branches.settings.print_mode`) — `print-ticket.tsx`; phiếu kiểu **"PHIẾU ĐẶT ĐỒ"** (iPOS): tiêu đề + MANG VỀ/BÀN + Giờ/Ngày/Nhân viên/STT + bảng `SL | Tên món | ĐVT` + footer Toda Café.
- **In trên Android**: KHÔNG dùng iframe ẩn (Chrome Android in nhầm trang app) → chèn phiếu + `@media print` ẩn app, `window.print()` top-level (`isAndroid()` trong print-ticket).
- **PWA** cài được (manifest + SW cache shell, KHÔNG cache `/api/`). **iOS safe-area**: header/nav/drawer chừa `env(safe-area-inset-*)`.
- **POS mobile** (giỏ dạng sheet) + **tối ưu màn ngang** (bỏ tiêu đề thừa, danh mục cuộn ngang, nhiều cột, ảnh thấp). Lọc danh mục client-side + badge đếm + placeholder thương hiệu.
- **Báo cáo đa chi nhánh** (`?allBranches=true`, breakdown theo chi nhánh) cho org_admin/super_admin.
- **Theme** Sáng/Tối + 4 màu nhấn (matcha/vàng Đông Dương/terracotta/xanh ngọc) — `theme-store` + `--accent-runtime`. Logo quán `brand-logo` (tự đổi màu theo nền nên hợp với mọi màu nhấn), đồng hồ realtime.
- **Bàn ăn rework**: bàn có đơn → **Thanh toán** (POS `?pay=1`) hoặc **Hủy bàn** (`PATCH /api/tables/sessions/:id/void` — hủy đơn chưa-TT + free bàn + log). Khu **"Mang về"** thẻ động (`GET/PATCH /api/tables/takeaway`). Ẩn QR khách. **Phân quyền cấu trúc bàn** (thêm/sửa/xóa) chỉ admin/quản lý (`canManageTables`).
- **Codex**: gộp/tách/chuyển bàn (`table_session_events`) + **tạo ảnh AI** cho món (`routes/ai-images.ts`, fal.ai/OpenAI, lưu volume `/uploads`).
- **Đơn vị tính (ĐVT)** cho từng món (ô ở product-dialog → in trên phiếu).
- **Modifier thông minh**: tách nhóm **Độ đậm/Đá/Đường/Sữa/Loại hạt**; "(nhẹ)" gộp vào Độ đậm; giá **+/-** (giảm giá); POS **tự chọn mặc định** (tùy chọn đầu nhóm bắt buộc); **đổi thứ tự nhóm & tùy chọn** (nút ↑↓ ở `modifier-groups-panel`).
- **Upload logo/ảnh món**: `storeUpload` lưu **cục bộ** (volume `uploadsdata` → Caddy `/uploads`) khi chưa cấu hình R2. `logoUrl`/`imageUrl` chấp nhận path tương đối (`publicImageUrlSchema`).
- **Bảng điều khiển** sửa: map đúng field API + chuyển sang route `/dashboard` (tránh `app/page.tsx` redirect `/orders`).
- **Codex**: thanh toán chuyển khoản qua **phiếu tạm tính QR 60 phút** (`payment_requests`, `payment_webhook_events`, `POST /api/payments/requests`, `POST /api/payments/webhooks/sepay`). POS in phiếu tạm tính có QR/mã hết hạn, webhook SePay mới tạo `payments.method=transfer`; cấu hình ngân hàng theo chi nhánh ở Settings → Chi nhánh (`branches.settings.payment.sepay`).
- **Mở ca / Đóng ca (két quầy)**: 1 ca mở/chi nhánh (`register_shifts`, migration 0007). **Phải mở ca mới tạo được đơn** — gate ở `routes/orders.ts` POST (chưa mở ca → 409 `NO_OPEN_SHIFT`). Mở ca nhập tiền đầu ca; đóng ca đếm tiền thực tế → tính tiền mặt kỳ vọng (đầu ca + thu tiền mặt) + chênh lệch + doanh thu theo phương thức, in được phiếu cuối ca. API `routes/shifts.ts` (`GET /current`, `POST /open`, `POST /close`), hook `use-shifts`, UI `pos/_components/shift-controls.tsx` (ShiftBar/Open/Close/Blocker) — POS bị khóa bằng `ShiftClosedBlocker` khi chưa mở ca. Quyền `shifts:*` (cashier/quản lý/admin mở-đóng, waiter chỉ xem). **Đặt món bắt buộc** chọn bàn (Ăn tại bàn) hoặc Mang về — chặn ở `pos/page.tsx` + disable nút ở `cart-sidebar`.
- **Trạm in tại quầy (in tập trung qua WebSocket)**: nhân viên order bằng điện thoại (không có máy in) → máy POS ở quầy **tự in phiếu bếp + kêu chuông + toast**. Máy POS bật cờ **"Trạm quầy"** ở **Cài đặt → tab "Thiết bị này"** (`settings/_components/device-tab.tsx`) hoặc nút 🖨️ trên header (`station-toggle`) — cờ lưu trong `station-store` (localStorage **theo thiết bị**, không phải branch settings). `station-provider` (mount trong `(dashboard)/layout.tsx`) nghe `branch:<id>` → khi `order:new` thì in qua `usePrintKitchenTicket` (driver theo `print_driver`). `order:new` ở `routes/orders.ts` đã được bơm thêm **số bàn + tên khách + giờ + tên modifier + ĐVT** để in đủ phiếu mà không cần fetch thêm. **POS không còn in cục bộ lúc tạo đơn** (`pos/page.tsx`) — mọi lệnh in phiếu bếp đi 1 đường qua Trạm quầy. ⚠️ Phải bật Trạm quầy trên ĐÚNG 1 máy có máy in, nếu không sẽ không máy nào in.
- **APK "TODA POS Quầy"** (`pos-android/`): vỏ Android (WebView nạp URL POS) + cầu in native **in thẳng Gprinter qua USB** (ESC/POS thô), phơi `window.TodaPrintBridge.printBase64()` → khớp driver `android_bridge`. Thay cho RawBT (RawBT qua intent chập chờn, không hợp chạy lâu). Build bằng GitHub Actions (`.github/workflows/build-apk.yml`) → tải artifact `app-debug.apk` → sideload lên iPOS. Đổi URL ở `MainActivity.java` (`POS_URL`). Xem `pos-android/README.md`.
- **Codex**: thêm **print driver nhanh cho Android POS** (`branches.settings.print_driver`). `browser_print` giữ `window.print()` fallback, `rawbt_intent` gửi ESC/POS base64 qua RawBT trên Android, `android_bridge` gửi payload ESC/POS cho bridge/WebView native. Phiếu bếp, hóa đơn, tạm tính QR đều có đường ESC/POS.

## 7. [ĐÃ TẮT 2026-07-04] Tương thích WebView cũ trên máy POS Android

> **Cập nhật 2026-07-04:** toàn bộ máy POS đã lên Android System WebView hiện đại (~Chromium 149, tự động qua Play Store). Lớp hạ cấp mô tả bên dưới đã **TẮT** để tối ưu tốc độ (bundle JS/CSS build ra không còn bị hạ cấp cú pháp cho toàn bộ người dùng, kể cả trang khách quét QR):
> - `apps/web/package.json` → `browserslist` nâng lên `chrome >= 111, edge >= 111, firefox >= 113, safari >= 16.4, ios_saf >= 16.4` (đúng ngưỡng Tailwind v4/Next 16 xuất ra tự nhiên, không hạ nữa).
> - `apps/web/postcss.config.mjs` → gỡ đăng ký `@restai/postcss-compat` (package vẫn còn trong `packages/postcss-compat/`, chỉ không gọi tới — nếu cần bật lại chỉ việc thêm lại dòng plugin).
> - Class `legacy-webview` + rule tắt animation/backdrop-blur trong `globals.css` **giữ nguyên** — tự vô hiệu khi Chrome UA ≥ 100 nên không cần đụng, không tốn chi phí runtime đáng kể.
>
> **Nếu sau này có máy POS nào tụt lại WebView cũ** (< Chrome 111) và app đứng khựng ở "Đang tải..."/vỡ layout: thêm lại dòng `"@restai/postcss-compat": {}` vào `postcss.config.mjs` và hạ `browserslist` như phần lịch sử bên dưới, build lại. Toàn bộ code hạ cấp KHÔNG bị xoá, chỉ tắt.

Máy POS quầy (iPOS, Android 11) chạy APK `pos-android/` (xem bullet "APK TODA POS Quầy" ở mục 6, và `pos-android/README.md`) — WebView nạp thẳng web POS. **Android System WebView của máy từng rất cũ (~Chromium 83)** dù bản Android mới, trong khi Next.js 16 / React 19 / Tailwind v4 xuất JS/CSS cho engine hiện đại (Chrome 111+). Chạy thẳng bằng Chrome ngoài thì OK (Chrome tự cập nhật), nhưng **trong APK từng vỡ hoàn toàn** nếu không hạ cấp. Đã từng xử các lớp sau (lịch sử, xem ghi chú TẮT ở trên):

1. **JS — toán tử logic gán mới (`??=`/`||=`/`&&=`, cần Chrome 85):** `apps/web/package.json` có field `"browserslist"` (`chrome >= 74`, `safari >= 13`...) → Next/Turbopack tự biên dịch xuống cú pháp cũ hơn. Thiếu field này → `Uncaught SyntaxError: Unexpected token '='` → app đứng khựng ở màn "Đang tải..." (không load được gì).
2. **CSS — toàn bộ xử trong plugin `@restai/postcss-compat`** (bảng lớp bên dưới). Bài học từ đợt đầu: từng THỬ và BỎ polyfill `@csstools/postcss-cascade-layers` vì nó thêm hack `:not(#\#)` vào specificity, làm vài utility (`max-height`, `gap`) thua độ ưu tiên → vỡ layout khác. **Đơn giản (gỡ vỏ / hạ cú pháp tương đương) > polyfill "đúng chuẩn".**

Các lớp CSS trong `packages/postcss-compat/index.mjs` (mỗi lớp = 1 tính năng + ngưỡng Chrome cần có):

| Lớp | Tính năng | Cần Chrome | Cách xử | Hậu quả nếu thiếu |
|---|---|---|---|---|
| A | `@property` | 85 | Đổ `initial-value` xuống `*` | Biến `--tw-*` không có giá trị đầu → transform/shadow/space invalid |
| B | `@layer` | 99 | Gỡ vỏ, giữ thứ tự nguồn | Mất sạch style Tailwind |
| C | `@supports` test color-mix/oklch | — | Gỡ vỏ (điều kiện dương) | Engine cũ evaluate false → vứt cả khối |
| D | `@media` range syntax `(width >= X)` | 104 | → `(min-width: X)` | **Mất TOÀN BỘ responsive `sm:/md:/lg:`** |
| E | `:is()` / `:where()` | 88 | Expand thành selector thường (hand-rolled, selector không expand được → tách rule riêng + warn lúc build) | `dark:`, `space-*`, `divide-*`, `group/peer-*` bị vứt nguyên rule → chữ dính |
| F | `oklch()` / `oklab()` | 111 | Convert toán học tĩnh → `rgb()` | Toàn bộ màu theme invalid |
| G | `color-mix()` | 111 | Lấy màu đầu tiên (đặc) | Nền/viền/badge trong suốt |
| H | `dvh`/`svh` | 108 | Chèn fallback `vh` trước decl gốc | Phần tử full-height sai |
| I | Logical shorthand `padding-inline`/`margin-inline`/`inset-inline`... | 87 | → physical left/right (app LTR) | **`px-*`/`mx-*` mất hết → chữ dính** |
| J | `inset:` shorthand | 87 | → top/right/bottom/left | Overlay dialog sai vị trí |
| K | Thuộc tính riêng `translate:`/`rotate:`/`scale:` (TW v4) | 104 | Gộp về 1 decl `transform:` pipeline kiểu TW v3 (var có fallback) | **Dialog mất `translate(-50%,-50%)` → lệch khỏi màn hình** |

> Lưu ý lớp K: đợt vá đầu chỉ đổ default cho `--tw-translate-*` (lớp A) mà không biết Tailwind v4 dùng **thuộc tính `translate:` riêng** (không phải `transform:`) → dialog vẫn lệch. Phải gộp về `transform:` mới ăn trên engine cũ.

Ngoài plugin còn 2 lớp hỗ trợ ở web:
- **Class `legacy-webview`** (script no-flash trong `app/layout.tsx` gắn khi UA Chrome < 100) + rule trong `globals.css` tắt toàn bộ animation/transition → giảm lag + né lỗi `animate-in/out` của Radix trên engine cũ.
- **Cài đặt → tab "Thiết bị này"** (`settings/_components/device-tab.tsx`) hiển thị **phiên bản Chromium + UA** của máy — chẩn đoán tại quán không cần adb. Nếu máy báo **Chromium < 84** thì `gap` trong flexbox cũng không chạy → cần vá thêm lớp gap-fallback (chưa làm, chờ xác nhận version).

Plugin là package workspace `@restai/postcss-compat` (export default 1 hàm `compat()` chạy ở `OnceExit`). Đăng ký ở `apps/web/postcss.config.mjs`:
```js
plugins: { "@tailwindcss/postcss": {}, "@restai/postcss-compat": {} }
```
⚠️ **Turbopack (Next 16) chỉ nhận plugin PostCSS khai báo theo TÊN PACKAGE** trong `postcss.config.mjs` — KHÔNG nhận đường dẫn tương đối (`"./foo.mjs"`) hay giá trị hàm/mảng import trực tiếp (build lỗi `module not found` / parse config). Vì vậy plugin tùy biến phải đóng gói thành package workspace thật, không phải file rời trong `apps/web/`.

⚠️ **Gotcha Docker khi thêm package workspace mới** (áp dụng cho `postcss-compat` và bất kỳ package mới nào sau này): phải copy `package.json` của package đó trong **CẢ `Dockerfile.web` VÀ `Dockerfile.api`** (đoạn `COPY packages/<tên>/package.json ...` trước dòng `RUN bun install --frozen-lockfile`) — `bun.lock` liệt kê cả workspace nên `bun install --frozen-lockfile` cần thấy đủ mọi `package.json`, kể cả service không dùng tới package đó. Quên 1 trong 2 Dockerfile → lỗi `Workspace dependency "@restai/xxx" not found` / `lockfile had changes, but lockfile is frozen`.

**Cách kiểm tra nhanh trước khi deploy** (đỡ tốn 1 vòng build VPS chậm — VPS 2GB dễ OOM khi build):
```bash
bun run --filter @restai/web build
f=$(find apps/web/.next -name "*.css" -size +10k | xargs ls -S | head -1)
# TẤT CẢ phải ra 0 (padding-inline:/inset: chỉ tính shorthand thật, --tw-ring-inset không tính):
for p in 'oklch\(' 'oklab\(' 'color-mix\(' '@layer' ':is\(' ':where\(' \
         '(width|height)\s*[<>]' 'padding-inline:' 'margin-inline:' \
         'translate:var' 'rotate:var' 'scale:var' '@container'; do
  echo "$p => $(grep -oE "$p" "$f" | wc -l)"
done
grep -c -- '--tw-translate-x:0' "$f"   # phải >= 1 (default đã đổ xuống *)
```

**Trạng thái (2026-07-02):** sau commit `2c03078` (4 lớp đầu) máy thật VẪN lỗi (dialog lệch khỏi màn hình, chữ dính, lag) → khảo sát lại phát hiện thêm 7 lớp thiếu (D, E, F, H, I, J, K ở bảng trên — nặng nhất là K `translate:`, D media range, I `padding-inline`) và đã vá đủ + build check sạch 100% + smoke-test Chrome desktop OK. Đang chờ anh Toàn xác nhận trên máy POS thật: (a) dialog modifier **căn giữa + cuộn + chọn được**, (b) thanh danh mục + spacing hết dính chữ, (c) màu theme đúng, (d) đọc **phiên bản Chromium** ở Cài đặt → Thiết bị này để quyết vụ flex-gap (nếu < 84 phải vá thêm), (e) in phiếu qua APK ra Gprinter **ngầm, không hộp thoại A4** (hộp thoại A4 CHỈ mất khi mở bằng app "TODA POS Quầy", KHÔNG phải Chrome). Nếu còn lỗi UI chỉ-trên-WebView-cũ → tiếp tục vá trong `packages/postcss-compat/index.mjs` theo cùng nguyên tắc (tra ngưỡng Chrome version của tính năng, so với ~83).

## 8. Gotchas (đọc kỹ trước khi sửa)

> 📐 Quy ước viết code (vỏ API, `AppError`, phân quyền, `Switch`/`Skeleton`/`PageHeader`/`SettingRow` dùng chung, 4 cái bẫy CSS đã trả giá): [CONVENTIONS.md](CONVENTIONS.md).

- **WebView cũ trên POS Android**: xem mục 7 — đã TẮT (2026-07-04) vì cả fleet lên WebView mới. Nếu máy nào tụt lại bản cũ, bật lại theo hướng dẫn ở đầu mục 7.
- **In**: máy in phải gắn ở thiết bị mở web. Desktop/browser fallback dùng `window.print()` (luôn hiện hộp thoại, không tắt được — hạn chế của trình duyệt, không phải bug). Android POS dùng APK `pos-android/` với `print_driver=android_bridge` để in ngầm qua USB; `rawbt_intent` (RawBT qua intent) đã THỬ và BỎ vì chập chờn, không hợp chạy lâu dài.
- **Deploy web xong máy POS báo "Failed to load chunk /_next/static/chunks/….js"** = kẹt cache, KHÔNG phải máy hỏng. HTML bản cũ do service worker phục vụ đi đòi file JS mà build mới đã xoá. Từ 2026-07-27 app **tự chữa** (xoá cache + gỡ SW + tải lại, có chốt chống lặp ở `global-error.tsx` / `(dashboard)/error.tsx`) và `sw.js` điều hướng đã đổi sang **ưu tiên mạng, hạn chờ 2 giây**. Máy nào lỡ kẹt từ trước bản vá thì chữa tay: Cài đặt → Ứng dụng → TODA POS Quầy → Bộ nhớ → **Xoá bộ nhớ đệm** (không khỏi mới **Xoá dữ liệu** — sẽ phải đăng nhập + quét lại QR kết nối). ⚠️ Đổi chiến lược cache trong `sw.js` thì **phải tăng số bản** `toda-pos-shell-vN`.
- **seed.ts TRUNCATE** sạch DB — chỉ cho DB trống. Backup `pg_dump` trước khi đụng DB (`/root/menu-backups`, `/root/db-backup-*`).
- **Phân quyền**: server ở `packages/config/src/index.ts` (`PERMISSIONS`); ẩn nav ở `(dashboard)/layout.tsx` (`allowedPaths`). Sửa 1 vai trò nhớ sửa cả 2 nơi.
- **Upload**: `lib/r2.ts` `storeUpload`/`deleteUpload`. Volume `uploadsdata` mount api(rw)/web(ro)/caddy(ro `/srv/uploads`).
- **Theme**: đổi accent → sửa `--accent-runtime` (globals.css) hoặc `ACCENTS` (theme-store).
- **CRLF**: `.gitattributes` ép LF; local đặt `git config core.autocrlf false`.
- **Thêm package workspace mới** (packages/xxx): nhớ copy `package.json` vào cả `Dockerfile.web` và `Dockerfile.api` (xem mục 7).

## 9. Deploy / script nhanh

```bash
# Trên VPS (/root/toda-pos)
git pull --ff-only origin master
docker compose up -d --build           # build web+api, migrate tự áp migration mới
docker compose up -d --build web        # chỉ web (~10p)  | api: nhanh

# ⚠️ VPS chỉ 2GB RAM — build "up -d --build web" đôi khi KÉO THEO rebuild
# api/migrate (base image chung đổi) → dễ OOM/kẹt. Nếu chỉ sửa web và muốn
# nhẹ hơn, tách 2 bước (không đụng service khác đang chạy):
docker compose build web && docker compose up -d --no-deps web

# Chạy script một lần (rebuild image migrate):
docker compose run --build --rm migrate bun run src/<tên-script>.ts
```
Tài khoản seed: `admin@toda.local/admin12345`, `quanly/quanly123`, `thungan/thungan123`, `phucvu/phucvu123`, `bep/bep12345`. Branch hiện tại id `d7da975e-15df-40ef-8088-f6317d809a6a`.
