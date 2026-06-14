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
| PWA | `app/manifest.ts`, `public/sw.js`, `public/icon.svg`. |
| Theme tokens | `app/globals.css` (biến shadcn + `--accent-runtime` đổi màu nhấn runtime). |
| Dashboard layout | `app/(dashboard)/layout.tsx` — sidebar nav, **`allowedPaths` theo vai trò**, branch switcher, ThemeSwitcher, ClockNow, nút thu gọn. |
| Bảng điều khiển | `app/(dashboard)/dashboard/page.tsx` (stats từ `/api/reports/dashboard`). |
| POS | `app/(dashboard)/pos/page.tsx` + `_components/`: `product-grid`, `cart-sidebar`, `modifier-dialog`, `pos-payment-dialog`, `success-dialog`. URL: `?tableId=&pay=1` (mở thanh toán), `?takeout=1`. |
| Bàn ăn | `app/(dashboard)/tables/page.tsx` + `_components/`: `grid-view`, `table-card`, `table-operations-dialog` (gộp/tách/chuyển — Codex), `space-management`, `floor-planner-view`. |
| Thực đơn | `app/(dashboard)/menu/page.tsx` + `_components/`: `products-panel`, `product-dialog`, `category-dialog`, `modifier-groups-panel`, `modifier-group-dialog`, `image-upload-button`. |
| Khác | `orders, kitchen, inventory, staff, payments, loyalty, reports, settings, connections`. |
| Khách QR | `app/(customer)/...` — tồn tại nhưng **đã ẩn** trong luồng bàn (`showCustomerQrFlow=false`). |
| Components dùng chung | `print-ticket` (phiếu bếp + in Android), `station-provider` (nghe `order:new` → tự in tại quầy), `station-toggle` (bật/tắt Trạm quầy theo thiết bị), `theme-switcher`, `toda-mark` (emblem), `clock-now`, `sw-register`, `page-header`, `confirm-dialog`. |
| Stores (Zustand) | `auth-store`, `cart-store`, `customer-store`, `lang-store`, `theme-store`, `station-store` (cờ Trạm quầy + chuông, lưu theo thiết bị). |
| Hooks | `use-menu`, `use-tables`, `use-orders`, `use-payments`, `use-reports`, `use-dashboard`, `use-settings`, `use-uploads`, `use-ai-images`, `use-kitchen/inventory/loyalty/staff/coupons`, `use-websocket`, `use-auth`. |
| Lib | `api-client`, `fetcher` (`apiFetch` tự gắn `x-branch-id`), `translations` (VI/EN), `utils` (`formatCurrency`). |

## 4. packages

- **db** — `schema/{enums,tenants,auth,tables,menu,orders,loyalty,inventory,payments,staff,coupons}.ts`; `drizzle/` migrations + `meta/`; `seed.ts` (⚠️ TRUNCATE toàn bộ rồi seed — KHÔNG chạy trên prod); `migrate.ts`; `setup-coffee-modifiers.ts` (script một lần dựng nhóm tùy chọn cà phê + gộp "(nhẹ)").
- **validators** — `index.ts` (zod schema cho mọi input).
- **config** — `index.ts` chứa **`PERMISSIONS`** (quyền theo vai trò) + state machine trạng thái đơn.
- **ui** — shadcn components. **types** — kiểu WS dùng chung.

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
- **Theme** Sáng/Tối + 4 màu nhấn (matcha/vàng Đông Dương/terracotta/xanh ngọc) — `theme-store` + `--accent-runtime`. Emblem `toda-mark`, đồng hồ realtime.
- **Bàn ăn rework**: bàn có đơn → **Thanh toán** (POS `?pay=1`) hoặc **Hủy bàn** (`PATCH /api/tables/sessions/:id/void` — hủy đơn chưa-TT + free bàn + log). Khu **"Mang về"** thẻ động (`GET/PATCH /api/tables/takeaway`). Ẩn QR khách. **Phân quyền cấu trúc bàn** (thêm/sửa/xóa) chỉ admin/quản lý (`canManageTables`).
- **Codex**: gộp/tách/chuyển bàn (`table_session_events`) + **tạo ảnh AI** cho món (`routes/ai-images.ts`, fal.ai/OpenAI, lưu volume `/uploads`).
- **Đơn vị tính (ĐVT)** cho từng món (ô ở product-dialog → in trên phiếu).
- **Modifier thông minh**: tách nhóm **Độ đậm/Đá/Đường/Sữa/Loại hạt**; "(nhẹ)" gộp vào Độ đậm; giá **+/-** (giảm giá); POS **tự chọn mặc định** (tùy chọn đầu nhóm bắt buộc); **đổi thứ tự nhóm & tùy chọn** (nút ↑↓ ở `modifier-groups-panel`).
- **Upload logo/ảnh món**: `storeUpload` lưu **cục bộ** (volume `uploadsdata` → Caddy `/uploads`) khi chưa cấu hình R2. `logoUrl`/`imageUrl` chấp nhận path tương đối (`publicImageUrlSchema`).
- **Bảng điều khiển** sửa: map đúng field API + chuyển sang route `/dashboard` (tránh `app/page.tsx` redirect `/orders`).
- **Codex**: thanh toán chuyển khoản qua **phiếu tạm tính QR 60 phút** (`payment_requests`, `payment_webhook_events`, `POST /api/payments/requests`, `POST /api/payments/webhooks/sepay`). POS in phiếu tạm tính có QR/mã hết hạn, webhook SePay mới tạo `payments.method=transfer`; cấu hình ngân hàng theo chi nhánh ở Settings → Chi nhánh (`branches.settings.payment.sepay`).
- **Mở ca / Đóng ca (két quầy)**: 1 ca mở/chi nhánh (`register_shifts`, migration 0007). **Phải mở ca mới tạo được đơn** — gate ở `routes/orders.ts` POST (chưa mở ca → 409 `NO_OPEN_SHIFT`). Mở ca nhập tiền đầu ca; đóng ca đếm tiền thực tế → tính tiền mặt kỳ vọng (đầu ca + thu tiền mặt) + chênh lệch + doanh thu theo phương thức, in được phiếu cuối ca. API `routes/shifts.ts` (`GET /current`, `POST /open`, `POST /close`), hook `use-shifts`, UI `pos/_components/shift-controls.tsx` (ShiftBar/Open/Close/Blocker) — POS bị khóa bằng `ShiftClosedBlocker` khi chưa mở ca. Quyền `shifts:*` (cashier/quản lý/admin mở-đóng, waiter chỉ xem). **Đặt món bắt buộc** chọn bàn (Ăn tại bàn) hoặc Mang về — chặn ở `pos/page.tsx` + disable nút ở `cart-sidebar`.
- **Trạm in tại quầy (in tập trung qua WebSocket)**: nhân viên order bằng điện thoại (không có máy in) → máy POS ở quầy **tự in phiếu bếp + kêu chuông + toast**. Máy POS bật cờ **"Trạm quầy"** ở **Cài đặt → tab "Thiết bị này"** (`settings/_components/device-tab.tsx`) hoặc nút 🖨️ trên header (`station-toggle`) — cờ lưu trong `station-store` (localStorage **theo thiết bị**, không phải branch settings). `station-provider` (mount trong `(dashboard)/layout.tsx`) nghe `branch:<id>` → khi `order:new` thì in qua `usePrintKitchenTicket` (driver theo `print_driver`). `order:new` ở `routes/orders.ts` đã được bơm thêm **số bàn + tên khách + giờ + tên modifier + ĐVT** để in đủ phiếu mà không cần fetch thêm. **POS không còn in cục bộ lúc tạo đơn** (`pos/page.tsx`) — mọi lệnh in phiếu bếp đi 1 đường qua Trạm quầy. ⚠️ Phải bật Trạm quầy trên ĐÚNG 1 máy có máy in, nếu không sẽ không máy nào in.
- **Codex**: thêm **print driver nhanh cho Android POS** (`branches.settings.print_driver`). `browser_print` giữ `window.print()` fallback, `rawbt_intent` gửi ESC/POS base64 qua RawBT trên Android, `android_bridge` gửi payload ESC/POS cho bridge/WebView native. Phiếu bếp, hóa đơn, tạm tính QR đều có đường ESC/POS.

## 7. Gotchas (đọc kỹ trước khi sửa)

- **In**: máy in phải gắn ở thiết bị mở web. Desktop/browser fallback dùng `window.print()`. Android POS USB nên đổi `branches.settings.print_driver` sang `rawbt_intent` hoặc `android_bridge` để bỏ dialog A4 Chrome.
- **seed.ts TRUNCATE** sạch DB — chỉ cho DB trống. Backup `pg_dump` trước khi đụng DB (`/root/menu-backups`, `/root/db-backup-*`).
- **Phân quyền**: server ở `packages/config/src/index.ts` (`PERMISSIONS`); ẩn nav ở `(dashboard)/layout.tsx` (`allowedPaths`). Sửa 1 vai trò nhớ sửa cả 2 nơi.
- **Upload**: `lib/r2.ts` `storeUpload`/`deleteUpload`. Volume `uploadsdata` mount api(rw)/web(ro)/caddy(ro `/srv/uploads`).
- **Theme**: đổi accent → sửa `--accent-runtime` (globals.css) hoặc `ACCENTS` (theme-store).
- **CRLF**: `.gitattributes` ép LF; local đặt `git config core.autocrlf false`.

## 8. Deploy / script nhanh

```bash
# Trên VPS (/root/toda-pos)
git pull --ff-only origin master
docker compose up -d --build           # build web+api, migrate tự áp migration mới
docker compose up -d --build web        # chỉ web (~10p)  | api: nhanh
# Chạy script một lần (rebuild image migrate):
docker compose run --build --rm migrate bun run src/<tên-script>.ts
```
Tài khoản seed: `admin@toda.local/admin12345`, `quanly/quanly123`, `thungan/thungan123`, `phucvu/phucvu123`, `bep/bep12345`. Branch hiện tại id `d7da975e-15df-40ef-8088-f6317d809a6a`.
