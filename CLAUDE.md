# TODA POS (restai)

Monorepo Bun + Turborepo — POS chuyên dụng cho quán cà phê TODA, đa chi nhánh.
Bối cảnh chung của hệ TODA đã tự nạp từ `~/.claude/toda/core.md`; file này chỉ nói phần riêng của repo.

## 📖 ĐỌC TRƯỚC KHI SỬA — đừng quét code

Repo này có sẵn tài liệu tốt. **Đọc tài liệu trước, rồi nhảy thẳng tới file liên quan.**

| File | Dùng khi |
|---|---|
| `ARCHITECTURE.md` | Bản đồ codebase: file nào ở đâu, log tính năng, migrations, gotcha đã trả giá |
| `CONVENTIONS.md` | Viết code thế nào cho đúng chuẩn repo (nhiều agent cùng sửa) |
| `AGENTS.md` | Quy trình git / deploy / database / bí mật |
| `DEPLOY.md` | Dựng và deploy VPS từng bước |

**Cập nhật `ARCHITECTURE.md` mỗi khi thêm tính năng hoặc đổi cấu trúc** — đó là điều giữ cho lần sau không phải quét lại.

## Stack & lệnh

- `apps/api` — Hono/Bun :3001, WebSocket `/ws` · `apps/web` — Next.js 16 App Router :3000
- `packages/{db,validators,config,ui,types}` · PostgreSQL 17 + Redis 7 (Drizzle)
- `bun run dev` · `bun run build` · `bun run lint`
- DB: `bun run db:generate` / `db:migrate` / `db:seed` / `db:studio`

## Deploy

VPS `/root/toda-pos` · repo `toantran9999-beep/automatic-carnival` (`master`).

⚠️ **KHÔNG deploy giữa giờ bán** (anh Toàn chốt 28/10/2026). Ban ngày chỉ commit + push (`/deploy-pos` = push + xem trước). **VPS tự deploy lúc 22h** (cron → `scripts/vps-deploy.sh --nightly`): chờ job AI đêm xong, build đúng dịch vụ cần (+`migrate` khi có `.sql` mới), tự kiểm, hỏng thì tự quay về, nhắn Telegram. Deploy ngay (`--now`) chỉ khi anh nói rõ. APK mới: chỉ nhắc cài sau giờ đóng cửa.

Hook trong `.claude/` (Python, không cần jq): chặn sửa `.env` thật + `momo key/` (`.env.example` vẫn sửa được), nhắc khi số `.sql` ≠ số mục journal.

⚠️ **Có file `.sql` mới trong `packages/db/drizzle/` thì bắt buộc `docker compose build api web migrate`** (không được chỉ `api web`) **và** phải thêm mục vào `drizzle/meta/_journal.json`. Bỏ sót → log vẫn in "completed successfully" mà DB không đổi. Chi tiết + cách xác minh: skill `toda-kb` → `infra.md`.

## 🚫 Ranh giới

- **Claude là agent duy nhất — KHÔNG dùng Codex nữa** (anh Toàn chốt 28/09/2026). Sửa local Windows → commit → push → deploy; **không sửa tay trên VPS**. Trước khi đè vẫn so bản VPS (có thể còn sửa tay cũ), so bằng `git diff -w` (CRLF từ Windows).
- Nhiều phiên Claude chạy song song trên repo này: **chỉ `git add` đúng file mình sửa**, thấy file lạ đang đổi thì để nguyên.
- `../social-automation/` là **dự án riêng tạo nhầm chỗ** — không thuộc POS, bỏ qua.
- Đừng đụng nhóm modifier `Độ đậm` / `Món thêm`, đừng bật `is_required` cho nhóm `Loại hạt` — xem `toda-kb` → `business.md`.
- `momo key/` — MoMo đã bỏ, chỉ dùng SePay (bấm tay, không webhook).

## ⚠️ Bẫy im lặng hay dính (chi tiết ở `toda-kb` → `conventions.md`)

- Tiền lưu bằng **xu** (÷100) · `unit_price` **chưa** gồm modifier (phải `loadItemModifiers`)
- Gom theo ngày phải `+ interval '7 hours'` — dùng `vnDayExpr`/`ordersInVnRange()` trong `routes/reports.ts`
- Dùng `dvh` không `vh`; **không** `md:py-*` ở `<main>` của `(dashboard)/layout.tsx`
- `sm:`/`md:` đo màn hình chứ không đo khung → không nhồi ≥3 nút vào `DialogFooter`
- Đổi chiến lược cache `sw.js` phải **tăng số bản** `toda-pos-shell-vN`
- Đừng xoá `@custom-variant dark` ở đầu `globals.css`

## Kiểm chứng

Không dừng ở "build pass". Đơn hàng thử → in phiếu ở Trạm quầy đúng số tiền (cộng dọc phải ra tổng) → thanh toán → đơn về `completed` → báo cáo ngày hiện đúng số (chia 100, đúng ngày VN). Thử **cả** trên/dưới 768px và **cả** tài khoản nhân viên lẫn quản lý.
