# Codex Activity Log

## 2026-06-11 19:55 +07

Task: Fix dashboard crash and Vietnamese fallback/loading text.

### Summary

- Read and followed `AGENTS.md`.
- Confirmed local `master` was clean and synced with `origin/master` before editing.
- Fixed dashboard table activity crash caused by treating the `/api/tables` response object as an array.
- Replaced Spanish loading/error fallback text with Vietnamese text in app error boundaries and initial redirect loading.
- Replaced remaining Spanish unknown-error fallback in order fetch handling.

### Files Changed By Codex In This Task

- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/error.tsx`
- `apps/web/src/app/global-error.tsx`
- `apps/web/src/app/(customer)/error.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/hooks/use-orders.ts`
- `apps/web/src/lib/fetcher.ts`
- `apps/api/src/services/order.service.ts`
- `CODEX_ACTIVITY_LOG.md`

### Notes For Claude

- Codex only touched dashboard crash handling, Vietnamese fallback/loading text, and one API modifier fallback label in this task.
- Codex did not edit POS layout, menu modifier ordering, table operations, product image AI, or database migrations.

## 2026-06-11 18:08 +07

Task: Make modifier options orderable and preserve display order in POS/customer option dialogs.

### Summary

- Read and followed `AGENTS.md`.
- Confirmed local `master` was clean and synced with `origin/master` before editing.
- Added up/down controls directly in the modifier groups panel so option order can be changed from the expanded list.
- Ensured item-specific modifier group APIs return options ordered by `sort_order`, then name.
- Kept the existing DB schema; no migration was needed because `modifiers.sort_order` already exists.

### Files Changed By Codex In This Task

- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/customer.ts`
- `apps/web/src/app/(dashboard)/menu/_components/modifier-groups-panel.tsx`
- `CODEX_ACTIVITY_LOG.md`

### Notes For Claude

- Codex only touched modifier option ordering for the menu/POS option flow in this task.
- Codex did not edit POS layout, table layout, table operations, product image AI, or database migrations.

## 2026-06-11 17:40 +07

Task: Compact POS ordering UI after owner feedback that the screen still felt unoptimized.

### Summary

- Read and followed `AGENTS.md`.
- Confirmed local `master` was clean and synced with `origin/master` before editing.
- Tightened the POS product grid so search/category controls stay sticky, product cards are shorter, and columns auto-fill by available width.
- Reduced the desktop cart sidebar width and vertical spacing so more products remain visible on the sales screen.
- Cleaned POS cart hard-coded Vietnamese labels in the touched component.

### Files Changed By Codex In This Task

- `apps/web/src/app/(dashboard)/pos/page.tsx`
- `apps/web/src/app/(dashboard)/pos/_components/product-grid.tsx`
- `apps/web/src/app/(dashboard)/pos/_components/cart-sidebar.tsx`
- `CODEX_ACTIVITY_LOG.md`

### Notes For Claude

- Codex only touched the POS selling screen and this activity log in this task.
- Codex did not edit dashboard layout.
- Codex did not edit table layout, table transfer/merge/split logic, API routes, hooks, or database migrations.

## 2026-06-09 10:27 +07

Task: Viet hoa DatePicker/Calendar display.

### Summary

- Read and followed `AGENTS.md`.
- Pulled latest `origin/master` before editing.
- Changed shared UI date picker/calendar locale from Spanish to Vietnamese.
- Replaced the default date picker placeholder from `Seleccionar fecha...` to `Chọn ngày...`.
- Changed selected date display from Spanish `PPP` output such as `2 de junio de 2026` to Vietnamese `d MMMM yyyy`, e.g. `2 tháng 6 2026`.

### Files Changed By Codex In This Task

- `packages/ui/src/components/date-picker.tsx`
- `packages/ui/src/components/calendar.tsx`

### Verification

- `bunx tsc --noEmit -p apps/web/tsconfig.json` succeeded.
- `bunx tsc --noEmit -p apps/api/tsconfig.json` succeeded.
- Commit pushed to GitHub: `c85329d Việt hóa date picker`.
- VPS pulled `origin/master` and rebuilt web successfully.
- Docker services `api` and `web` are healthy after deploy.

### Notes For Claude

- Codex did not edit dashboard layout in this task.
- Codex did not touch table operations in this task.
- Local working tree still had unrelated dirty files before/after this task:
  - `apps/api/src/routes/tables.ts`
  - `apps/web/src/app/(dashboard)/tables/_components/table-card.tsx`
  - `apps/web/src/hooks/use-tables.ts`
- Those unrelated dirty files were intentionally not added to the date picker commit.

## 2026-06-09 09:52 +07

Task: Reconcile multi-agent Git state after Claude reported possible layout/function overwrite.

### Summary

- Read `AGENTS.md` before making changes.
- Confirmed the required source of truth is GitHub repo `toantran9999-beep/automatic-carnival`, branch `master`.
- Found local Windows `origin` was still pointing at `https://github.com/EijunnN/restai.git`.
- Changed local Windows `origin` to `https://github.com/toantran9999-beep/automatic-carnival.git`.
- Ran `git fetch origin`; local `master` now matches `origin/master`.
- Checked VPS `/root/toda-pos`; it already uses the correct GitHub remote.
- Ran `git fetch origin` on VPS; VPS `master` now matches `origin/master`.
- Moved untracked VPS `.env.bak*` file(s) out of the repo into `/root/toda-pos-env-backups/` so `git status` is clean without deleting secrets.

### Verification

- Local Windows status: clean against `origin/master`.
- VPS status: clean against `origin/master`.
- Confirmed table operations feature is still present on VPS:
  - transfer endpoint exists in `apps/api/src/routes/tables.ts`
  - merge endpoint exists in `apps/api/src/routes/tables.ts`
  - split endpoint exists in `apps/api/src/routes/tables.ts`
  - `TableOperationsDialog` exists in `/tables` components
  - `table_session_events` migration exists
- Public API smoke tests for transfer/merge/split with fake UUIDs returned expected business errors, not 404.

### Notes For Claude

- Codex did not edit dashboard layout in this reconciliation task.
- Codex did not change table operation code in this reconciliation task.
- The only repo-tracked change from this task is this activity log entry.
- GitHub `origin/master` is now the shared source of truth for both local Windows and VPS.

## 2026-06-08 20:39 +07

Task: Implement "Gop/Tach/Chuyen Ban Tren Dien Thoai Nhan Vien".

### Summary

- Added backend APIs for transfer, merge, and split table sessions.
- Added audit logging table for table/session operations.
- Added a small table operation dialog in the existing `/tables` screen.
- Added realtime refresh event `table:layout_changed`.
- Built API and web successfully locally.
- Deployed the change to VPS and verified health/public route.

### Files Changed By Codex In This Task

- `apps/api/src/routes/tables.ts`
  - Added:
    - `POST /api/tables/sessions/:id/transfer`
    - `POST /api/tables/sessions/merge`
    - `POST /api/tables/sessions/:id/split`
  - Added transactional logic for moving orders/session state.
  - Added completed-order guards.
  - Publishes `table:layout_changed`.

- `apps/web/src/hooks/use-tables.ts`
  - Added React Query mutations for transfer, merge, and split.

- `apps/web/src/app/(dashboard)/tables/page.tsx`
  - Added state for the table operations dialog.
  - Added websocket handling for `table:layout_changed`.
  - Passed operation callback into `GridView`.

- `apps/web/src/app/(dashboard)/tables/_components/grid-view.tsx`
  - Passed `onOperations` callback down to `TableCard`.

- `apps/web/src/app/(dashboard)/tables/_components/table-card.tsx`
  - Added a small icon button on occupied tables to open table operations.

- `apps/web/src/app/(dashboard)/tables/_components/table-operations-dialog.tsx`
  - New dialog for:
    - Chuyen ban
    - Gop ban
    - Tach mon

- `packages/db/src/schema/tables.ts`
  - Added `tableSessionEvents` schema for audit log.

- `packages/db/drizzle/0002_table_session_events.sql`
  - New migration for `table_session_events`.

- `packages/db/drizzle/meta/_journal.json`
  - Registered migration `0002_table_session_events`.

- `packages/types/src/index.ts`
  - Added websocket event type `table:layout_changed`.

### Files Not Touched By Codex In This Task

- `apps/web/src/app/(dashboard)/layout.tsx`
- Global app shell/sidebar layout files outside `/tables`
- POS menu/product UI outside table operations
- Kitchen print flow
- Payment flow

### Verification Run

- `bun run --filter @restai/api build` succeeded.
- `bun run --filter @restai/web build` succeeded.
- VPS deploy completed with Docker Compose.
- `https://api.14.225.212.172.nip.io/health` returned OK.
- `https://pos.14.225.212.172.nip.io/tables` returned 200.
- Postgres table `public.table_session_events` exists.
- Public split endpoint was smoke-tested with a fake session ID and returned the expected business error without changing live table data.

### Notes For Claude

- The only frontend layout-adjacent changes are scoped to the `/tables` page and table card components.
- If a broader dashboard/sidebar/app layout changed, that was not from this Codex table-operations task.
- The new UI entrypoint is intentionally small: an icon button on occupied table cards opens the operation dialog.

---

## 2026-06-12 - Codex - Bank transfer temporary bill QR (SePay)

### Goal

Implement bank-transfer payment flow where POS prints a temporary bill with a 60-minute VietQR/payment code. SePay webhook confirms the transfer and only then creates the real `payments.method=transfer` record.

### Files Touched By Codex

- `packages/db/src/schema/payments.ts`
  - Added `paymentRequests` and `paymentWebhookEvents` schema.
- `packages/db/drizzle/0006_payment_requests.sql`
  - Added migration for transfer payment requests and webhook event audit log.
- `packages/db/drizzle/meta/_journal.json`
  - Registered migration `0006_payment_requests`.
- `packages/validators/src/index.ts`
  - Added `createPaymentRequestSchema`; allowed branch settings payload.
- `apps/api/src/routes/payments.ts`
  - Added public `POST /api/payments/webhooks/sepay`.
  - Added `POST /api/payments/requests` and `GET /api/payments/requests/:id`.
  - Webhook matches by `TODA-*` payment code, enforces 60-minute expiry, logs stale/underpaid/duplicate events, and publishes payment WS events.
- `apps/api/src/routes/branches.ts`
  - Allowed branch `settings` updates for payment configuration.
- `apps/web/src/hooks/use-payments.ts`
  - Added hooks for creating/polling payment requests.
- `apps/web/src/components/print-ticket.tsx`
  - Added 80mm temporary transfer bill printer with QR/payment code/expiry.
- `apps/web/src/app/(dashboard)/pos/_components/pos-payment-dialog.tsx`
  - Transfer method now prints a temporary QR bill instead of completing payment immediately.
  - Shows pending/paid/underpaid/expired transfer status.
- `apps/web/src/hooks/use-settings.ts`
  - Allowed branch settings payload in update hooks.
- `apps/web/src/app/(dashboard)/settings/_components/sedes-tab.tsx`
  - Added per-branch SePay/VietQR bank configuration fields.
- `ARCHITECTURE.md`
  - Documented migration and feature log.

### Files Not Touched By Codex In This Task

- `apps/web/src/app/(dashboard)/layout.tsx`
- Sidebar/navigation layout files
- Menu/product card layout
- Table operation UI and APIs
- Kitchen ticket order creation flow

### Verification Run

- `bunx tsc --noEmit -p apps/api/tsconfig.json` succeeded.
- `bunx tsc --noEmit -p apps/web/tsconfig.json` succeeded.

### Notes For Claude

- This task intentionally touches Settings branch dialog only to configure `branches.settings.payment.sepay`.
- The transfer button no longer marks an order paid directly; webhook confirmation or the existing manual payment path must create the final payment.
- Temporary bills reuse active pending codes within 60 minutes and create a fresh code after expiry.

### Follow-up Same Feature

- `apps/web/src/app/(dashboard)/pos/_components/cart-sidebar.tsx`
  - Added visible `Tạm tính` button in the POS cart action row.
  - Added `Tạm tính` for occupied-table/unpaid-order state when cart is empty.
- `apps/web/src/app/(dashboard)/pos/page.tsx`
  - Added handler to create/reuse a 60-minute transfer payment request and print the temporary QR bill directly from POS.
  - If cart has unsent items, it creates the order first, then prints the temporary bill without reprinting kitchen tickets.
- `apps/api/src/routes/payments.ts`
  - Adjusted webhook stale-amount validation so a payment request for a whole table session can cover multiple unpaid orders.

Verification:
- `bunx tsc --noEmit -p apps/web/tsconfig.json` succeeded.
- `bunx tsc --noEmit -p apps/api/tsconfig.json` succeeded.

---

## 2026-06-13 - Codex - Android POS fast print driver

### Goal

Stop Android Chrome from printing the whole PWA as an A4 page. Add configurable print drivers so Android POS can send ESC/POS directly through RawBT or a future native bridge, while desktop keeps browser print fallback.

### Files Touched By Codex

- `apps/web/src/components/print-ticket.tsx`
  - Added ESC/POS builders for kitchen tickets, receipts, and temporary transfer bills with QR command support.
  - Added `browser_print`, `rawbt_intent`, and `android_bridge` driver routing.
  - RawBT mode opens a `rawbt:base64,...` payload only on Android; desktop falls back to browser print.
- `apps/web/src/app/(dashboard)/settings/_components/branch-tab.tsx`
  - Added branch-level print driver selector.
- `apps/api/src/routes/settings.ts`
  - Persists `branches.settings.print_driver`.
- `packages/validators/src/index.ts`
  - Validates `printDriver`.
- `apps/web/src/lib/translations.ts`
  - Added print driver labels/help text.
- `ARCHITECTURE.md`
  - Documented `print_driver` and Android print path.

### Files Not Touched By Codex In This Task

- POS layout/product grid/sidebar behavior
- Payment QR/webhook logic
- Table operations
- Native Android APK project, because no Android/Capacitor project exists in this repo yet

### Verification Run

- `bunx tsc --noEmit -p apps/web/tsconfig.json` succeeded.
- `bunx tsc --noEmit -p apps/api/tsconfig.json` succeeded.

### Notes For Claude

- To test on the iPOS Android device, set Settings -> Branch -> Print driver to `RawBT / ESC-POS nhanh` and install/configure RawBT with the USB Gprinter.
- `android_bridge` is a protocol hook for a future native wrapper: `window.TodaPrintBridge.printBase64(...)` or local `POST http://127.0.0.1:18180/print`.

---

## 2026-06-13 - Codex - Align Android ESC/POS receipts

### Goal

Fix the first real RawBT print sample where the temporary transfer bill text was too wide and the QR block was left-aligned on 80mm paper.

### Files Touched By Codex

- `apps/web/src/components/print-ticket.tsx`
  - Reduced ESC/POS text width from 42 to 38 safe columns.
  - Added centered line helper for receipt titles/header/footer.
  - Added ESC/POS alignment commands around QR printing.
  - Reduced QR module size from 6 to 5 so it sits better on narrow 80mm printable area.
- `CODEX_ACTIVITY_LOG.md`
  - Added this attribution note.

### Files Not Touched By Codex In This Task

- POS layout/sidebar/product grid
- Payment request creation/webhook logic
- Branch settings schema/API

### Verification Run

- `bunx tsc --noEmit -p apps/web/tsconfig.json` succeeded.
- `bunx tsc --noEmit -p apps/api/tsconfig.json` succeeded.
