# Codex Activity Log

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
