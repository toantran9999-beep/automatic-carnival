# Handoff: TODA POS — Giao diện bán hàng (Point of Sale)

> Tài liệu này đủ để một developer (hoặc Claude Code) tự dựng lại giao diện, build thành web app thật và deploy lên VPS — không cần xem lại cuộc hội thoại gốc.

---

## 1. Tổng quan (Overview)

Giao diện POS cho chuỗi cà phê **TODA CAFÉ** (nhà hàng/quán nước Việt Nam). Gồm:
- **Màn POS (Bán hàng):** lưới món → chọn món → tuỳ chọn (size/đá/đường/topping/ghi chú) → giỏ hàng → tính tiền → gửi đơn.
- **Màn Bàn ăn:** sơ đồ bàn theo khu vực với trạng thái, chạm bàn để mở/tiếp đơn (nhảy qua POS).
- Các mục nav khác (Đơn hàng, Nhà bếp, Kho hàng, Nhân viên, Thanh toán, Khách thân thiết, Báo cáo, Cài đặt) hiện là **màn stub "đang phát triển"** — chưa dựng.
- **Tweaks** (panel chỉnh nhanh): theme sáng/tối, màu nhấn, kiểu thẻ, bật/tắt giảm giá thân thiết. *Đây là công cụ prototype — KHÔNG cần port sang production.*

Ngôn ngữ UI: **tiếng Việt** (có nút chuyển VI/EN nhưng EN chưa có bản dịch — cần i18n nếu muốn).

---

## 2. Về các file thiết kế (About the Design Files)

Các file trong bundle là **bản dựng tham chiếu bằng HTML + React (qua Babel in-browser)** — chúng minh hoạ *hình thức và hành vi mong muốn*, KHÔNG phải code production để bê nguyên.

**Nhiệm vụ:** dựng lại các màn này trong môi trường codebase mục tiêu, theo pattern/thư viện sẵn có của nó. Nếu chưa có codebase, hãy chọn framework phù hợp (khuyến nghị **React + Vite + TypeScript**, hoặc Next.js) và hiện thực hoá ở đó. CSS hiện viết tay bằng CSS variables thuần — có thể giữ nguyên, hoặc chuyển sang Tailwind/CSS Modules tuỳ chuẩn dự án.

---

## 3. Độ chi tiết (Fidelity)

**High-fidelity (hifi).** Màu, typography, spacing, bo góc, shadow và tương tác đều là bản cuối. Hãy dựng lại **pixel-perfect**. Mọi giá trị token nằm ở mục 9.

---

## 4. Kiến trúc & bố cục tổng (Layout shell)

Khung 3 cột, full-viewport, `height:100vh; overflow:hidden`:

```
┌────────────┬─────────────────────────────┬──────────────┐
│  Sidebar   │   Center (TopBar + Main)     │  Cart panel  │
│  262px     │   flex:1                     │  384px       │
│ (thu→78px) │                              │ (chỉ ở POS)  │
└────────────┴─────────────────────────────┴──────────────┘
```

- `.app{display:flex;height:100vh;overflow:hidden}`
- **Sidebar** rộng `--sb-w:262px`, thu gọn `--sb-cw:78px` (toggle nút tròn ở mép phải header).
- **Center** = TopBar (cao 60px) + vùng Main cuộn dọc.
- **Cart panel** rộng `--cart-w:384px`, **chỉ hiện ở màn POS**; các màn khác Center chiếm hết.
- Responsive: `@media(max-width:1180px)` → `--cart-w:340px; --sb-w:228px`.
- Thiết kế cho **màn cảm ứng desktop/tablet ngang** (~1280–1920px). Hit target ≥ 44px.

---

## 5. Các màn (Screens / Views)

### 5.1 Sidebar (luôn hiển thị)
- **Header:** ô logo 42×42 (bo 12px, nền `accent 16%`, viền `accent 35%`) chứa emblem cây; chữ "TODA POS" (800, 16px, letter-spacing .04em) + phụ đề "Quản lý nhà hàng" (11.5px, text-dim). Nút collapse tròn 24px nổi ở mép phải.
- **Branch chip:** "Chi Nhánh Chính" + icon — nền card, bo 10px.
- **Nav** chia nhóm, mỗi nhóm có nhãn nhỏ (10.5px, 700, letter-spacing .12em, text-faint):
  - **CHUNG:** Bảng điều khiển
  - **HOẠT ĐỘNG:** POS (Bán hàng), Đơn hàng `[badge 3]`, Bàn ăn, Nhà bếp `[badge 2]`, Thực đơn
  - **QUẢN LÝ:** Kho hàng, Nhân viên, Thanh toán
  - **KINH DOANH:** Khách hàng thân thiết, Báo cáo, Cài đặt
- **Nav item:** padding 10/11px, bo 10px, 14px/500. Hover → nền card + text sáng. **Active** → nền `accent 16%`, text sáng/600, icon màu accent, có thanh dọc 3px màu accent ở mép trái. Badge: pill nền accent, chữ trắng 11px/700.
- **Footer:** avatar gradient accent 38×38 ("QT") + tên "Quản Trị Viên"/role + nút đăng xuất (hover đỏ `#e06a52`).

### 5.2 TopBar (cao 60px, border-bottom)
Phải→trái: segmented **VI/EN** (active = nền accent), chip "Chi Nhánh Chính", nút chuông (có chấm đỏ thông báo), avatar nhỏ + "Quản Trị Viên".

### 5.3 Màn POS (Bán hàng) — `active==="pos"`
- **Page head:** H1 "POS (Bán hàng)" (26px/800), phụ đề "Chọn món để tạo đơn hàng mới"; bên phải đồng hồ thời gian thực `HH:MM:SS` (cập nhật mỗi giây, tabular-nums) trong chip.
- **Search bar:** cao 48px, bo 12px, icon kính lúp; lọc theo `name.includes(query)` (không phân biệt hoa thường); có nút xoá khi có text. Focus → viền accent.
- **Category chips:** Tất cả / CÀ PHÊ / SINH TỐ & ĐÁ XAY / TRÀ & MÓN KHÁC / CÀ PHÊ BỘT HẠT / THUỐC LÁ. Mỗi chip có **badge đếm số món**. Active = nền accent.
- **Product grid:** `grid-template-columns:repeat(auto-fill,minmax(208px,1fr)); gap:16px` (kiểu `compact` → minmax 168px, gap 13px). Vùng grid cuộn dọc.
- **Product card:** ảnh tỉ lệ 4/3 + footer (tên 14px/600 + giá 15px/700 màu accent, tabular-nums). Hover → nhấc lên 3px, viền accent, shadow. Click → mở modal tuỳ chọn (nếu món có opts) hoặc thêm thẳng vào giỏ (nếu không).
  - Ảnh hiện là **placeholder thương hiệu**: nền gradient theo tông danh mục + emblem cây + chữ "Toda Café" + tag danh mục góc dưới + badge "NÓNG / ĐÁ" góc trên (nếu `hot`). **Khi có ảnh thật → thay placeholder bằng `<img>` (object-fit:cover), giữ nguyên khung 4/3.**

### 5.4 Cart panel (Đơn hàng POS) — chỉ ở POS
- **Header:** "Đơn hàng POS" + icon giỏ accent; badge "N món" khi có hàng.
- **Segmented Ăn tại bàn / Mang về** (active = nền accent).
- Nếu "Ăn tại bàn" → **dropdown chọn bàn** (danh sách `TABLES`).
- **Input tên khách hàng.**
- **Giỏ rỗng:** icon giỏ lớn + "Giỏ hàng trống" + gợi ý.
- **Dòng món:** emblem nhỏ + tên + dòng tuỳ chọn (vd "M · Ít đá · 50%") + ghi chú in nghiêng màu accent + đơn giá; bên phải nút xoá + stepper số lượng.
- **Totals:** Tạm tính → Giảm giá (5%) → **Tổng cộng** (19px/800, số màu accent). Phân cách bằng đường gạch đứt.
- **Nút "Gửi Đơn hàng · <tổng>"** cao 56px nền accent; disable khi giỏ rỗng (nền card, không bấm được).

### 5.5 Màn Bàn ăn — `active==="tables"` (Cart panel ẩn)
- **Page head:** H1 "Bàn ăn" + phụ đề; bên phải stats: `<n> đang phục vụ` (accent), `<n> đặt trước` (vàng `#d8a23a`), `<n> trống`.
- **Filter chips:** Tất cả / Trống / Đang phục vụ / Đặt trước.
- **Khu vực (zone):** tiêu đề nhỏ in hoa + đường kẻ; mỗi zone là 1 lưới `repeat(auto-fill,minmax(212px,1fr))`.
- **Thẻ bàn** (min-height 148px, thanh trạng thái 4px mép trái màu `--st`):
  - `empty` (Trống): viền nét đứt, nền trong suốt, hiện "số chỗ" + CTA "+ Mở bàn" (màu accent).
  - `serving` (Đang phục vụ): nền `accent 9%`, hiện số khách/chỗ, thời gian + tên NV, tạm tính + CTA "Gọi thêm →". Chấm trạng thái có animation pulse.
  - `bill` (Xin tính tiền): nền `#e0795a 11%`, giống serving + CTA "Tính tiền →" màu cam.
  - `reserved` (Đặt trước): viền/thanh vàng `#d8a23a`, hiện tên khách + giờ giữ + CTA "Nhận bàn".
  - **Click bàn → chuyển sang POS, set `mode="dine"` và chọn sẵn bàn đó** (map id: `B0n`→"Bàn 0n", `VIPn`→"Bàn VIP n").

### 5.6 Màn stub — các `active` còn lại
Card giữa màn: emblem + tên mục + dòng "đang được hoàn thiện" + tag "TODA POS · đang phát triển".

---

## 6. Tương tác & hành vi (Interactions)

- **Chọn món:** có opts → mở `CustomizeModal`; không opts → thêm thẳng vào giỏ (qty 1).
- **CustomizeModal:** scrim mờ (`backdrop-filter:blur(3px)`, đóng khi click nền hoặc Esc). Header (emblem + tên + giá gốc + nút X). Body: từng nhóm option là hàng chip chọn 1 (size cộng tiền: M +5.000đ, L +10.000đ; topping: Trân châu/Thạch +5.000đ, Pudding +7.000đ). Có input ghi chú. Footer: stepper số lượng + nút "Thêm · <đơn giá×qty>". Animation `pop` khi mở.
- **Gộp dòng giỏ:** cùng món + cùng tuỳ chọn + cùng ghi chú (`lineId` trùng) → cộng dồn số lượng.
- **Stepper giỏ:** giảm về 0 → xoá dòng.
- **Giảm giá thân thiết:** nếu bật `loyalty` VÀ có nhập tên khách → giảm 5% trên tạm tính (làm tròn).
- **Gửi đơn:** hiện toast xác nhận (kèm tổng + nơi nhận: tên bàn / "Mang về"), rồi reset giỏ + tên khách + bàn.
- **Toast:** nổi giữa đáy, nền accent, tự ẩn sau 2.2s.
- **Đồng hồ:** cập nhật mỗi giây.
- **Theme/accent:** áp qua thuộc tính `data-theme` và CSS var `--accent` trên `<html>`.

> ⚠️ **Lưu ý:** đây là prototype, mọi dữ liệu là **giả lập client-side**. Production cần nối API: danh mục/món, bàn, tạo đơn (gửi xuống bếp/KDS), thanh toán.

---

## 7. State (gợi ý cho production)

App-level: `activeScreen`, `sidebarCollapsed`, `lang`, `theme`, `accent`.
POS: `category`, `searchQuery`, `pickingItem` (mở modal), `cart[]`, `orderMode` ('dine'|'take'), `selectedTable`, `customerName`, `toast`.
Modal: `selectedOptions{}`, `quantity`, `note`.
Tables: `floorFilter`.

Dòng giỏ (cart line): `{ id, name, unit, qty, optLabel, note, lineId }` — `unit` = giá gốc + phụ phí option; `lineId` = `id|<các option>|<note>`.

Data cần fetch từ backend: danh sách `MENU` (id, name, price, cat, opts[], hot), `OPT_GROUPS`, `CATS`, danh sách bàn + trạng thái realtime.

---

## 8. Hệ icon & emblem

- **Emblem TODA** = SVG cây đơn giản trong vòng tròn (`TodaMark` trong `toda-data.jsx`). Đây là **bản tái dựng tối giản, KHÔNG phải logo gốc** — hãy thay bằng file logo chính thức của quán khi có.
- Icon UI: bộ stroke SVG tự vẽ (`Icons` trong `toda-data.jsx`), `stroke-width` ~1.7. Có thể thay bằng thư viện (vd **lucide-react**) cho gọn.

---

## 9. Design tokens

### Màu — Dark (mặc định, `html[data-theme="dark"]`)
| Token | Giá trị (oklch) | Vai trò |
|---|---|---|
| `--bg` | `oklch(0.175 0.012 250)` | nền chính |
| `--sidebar` | `oklch(0.135 0.013 250)` | nền sidebar |
| `--panel` | `oklch(0.155 0.012 250)` | nền cart panel |
| `--card` | `oklch(0.215 0.012 250)` | nền thẻ |
| `--card-h` | `oklch(0.255 0.013 250)` | thẻ hover |
| `--field` | `oklch(0.205 0.012 250)` | nền input |
| `--border` | `oklch(0.30 0.012 250)` | viền |
| `--border-soft` | `oklch(0.255 0.012 250)` | viền nhạt |
| `--text` | `oklch(0.955 0.008 95)` | chữ chính (kem ngà) |
| `--text-dim` | `oklch(0.66 0.012 250)` | chữ phụ |
| `--text-faint` | `oklch(0.45 0.012 250)` | chữ mờ |

### Màu — Light (`html[data-theme="light"]`)
`--bg:oklch(0.955 0.008 95)`, `--sidebar/--panel:oklch(0.99 0.006 95)`, `--card:oklch(0.995 0.003 95)`, `--card-h:oklch(0.975 0.008 95)`, `--field:oklch(0.975 0.007 95)`, `--border:oklch(0.885 0.01 95)`, `--border-soft:oklch(0.92 0.008 95)`, `--text:oklch(0.26 0.02 255)`, `--text-dim:oklch(0.5 0.016 255)`, `--text-faint:oklch(0.72 0.012 255)`.

### Màu nhấn (`--accent`, đổi runtime)
| Tên | Hex |
|---|---|
| Xanh matcha (mặc định, theo logo) | `#7aa653` |
| **Vàng Đông Dương / vàng chùa** | `#c79a2e` |
| Terracotta gạch | `#b06b4e` |
| Xanh ngọc | `#5a9d8c` |
| `--accent-ink` (chữ trên nền accent) | `#fff` |

### Màu trạng thái bàn
Serving = `--accent`; Reserved = `#d8a23a`; Bill/cảnh báo = `#e0795a`; Empty = `--text-dim`.

### Typography
- Font: **Be Vietnam Pro** (Google Fonts, weights 300–800) — chọn vì hỗ trợ dấu tiếng Việt rất tốt.
- H1 26px/800; section/tên bàn 21px/800; tiêu đề panel 16.5px/700; nav 14px/500; body 13–14.5px; nhãn nhóm/tag 10.5–12px/700 letter-spacing rộng.
- Mọi **số tiền/số lượng** dùng `font-variant-numeric:tabular-nums`.
- Định dạng tiền: `n.toLocaleString("vi-VN") + "đ"`.

### Bo góc / shadow / khoảng cách
`--r:14px`, `--r-sm:10px`; nút lớn/modal 13–20px; pill 99px.
Shadow card hover (dark): `0 12px 34px -12px rgba(0,0,0,.55)`.
Spacing nội dung 14–26px; gap lưới 13–16px.

---

## 10. Danh mục file trong bundle

| File | Nội dung |
|---|---|
| `TODA POS.html` | Shell: toàn bộ CSS (tokens + mọi component), nạp React/Babel + 5 script JSX. |
| `toda-data.jsx` | Emblem `TodaMark`, bộ `Icons`, dữ liệu `NAV`/`CATS`/`MENU`/`OPT_GROUPS`/`CAT_TONE`/`TABLES`, helper `fmtVND`. |
| `toda-components.jsx` | `Sidebar`, `TopBar`, `ProductCard`, `ProductGrid`, `CustomizeModal`, `Toast`. |
| `toda-tables.jsx` | `TablesScreen` (sơ đồ bàn + data `FLOOR`), `StubScreen`. |
| `toda-app.jsx` | `App` (state + lắp ráp + switch màn), `ClockNow`, mount. |
| `tweaks-panel.jsx` | Panel tweaks (chỉ phục vụ prototype — **bỏ khi lên production**). |

> Cách xem: mở `TODA POS.html` bằng web server tĩnh bất kỳ (React/Babel transpile in-browser nên cần serve qua http, không mở `file://`).

---

## 11. Khuyến nghị triển khai & deploy lên VPS

**Bước port sang production (khuyến nghị React + Vite + TS):**
1. `npm create vite@latest toda-pos -- --template react-ts`
2. Cài Be Vietnam Pro (qua `@fontsource/be-vietnam-pro` hoặc `<link>` Google Fonts).
3. Tách CSS trong `TODA POS.html` thành `index.css` (giữ nguyên CSS variables + `data-theme`).
4. Chuyển từng component JSX (đang dùng global `window.*`) sang **ES modules + import/export**, đổi `React.createElement`/Babel-in-browser sang JSX biên dịch bởi Vite. Thay icon tự vẽ bằng `lucide-react` nếu muốn.
5. Tách dữ liệu giả thành lớp API (fetch menu/bàn/đơn). Bỏ `tweaks-panel.jsx`.
6. i18n nếu cần (hiện chỉ có VI).

**Build & deploy VPS:**
- `npm run build` → ra thư mục `dist/` (tĩnh).
- Serve bằng **Nginx** (hoặc Caddy): trỏ `root` vào `dist/`, bật `try_files $uri /index.html;` cho SPA.
- HTTPS: Let's Encrypt qua Certbot (hoặc Caddy auto-TLS).
- Nếu có backend: chạy API (Node/PHP/...) sau reverse proxy Nginx; FE gọi `/api`.
- Gợi ý CI: build trên máy/Actions rồi `rsync dist/` lên VPS, hoặc Docker (multi-stage build → image Nginx tĩnh).

> Bản HTML hiện tại có thể chạy tạm ngay trên VPS như **trang tĩnh demo** (serve qua Nginx) vì nó transpile in-browser — nhưng **không khuyến khích cho production** (chậm, không tách API, lệ thuộc CDN unpkg). Hãy port theo bước trên.
