/**
 * Nhập lịch sử bán hàng của POS cũ vào `sales_history_daily` / `sales_history_items`.
 *
 *   1. PYTHONIOENCODING=utf-8 python scripts/extract-legacy-sales.py
 *   2. DATABASE_URL=... bun run --filter @restai/db import-legacy
 *
 * Cờ: --dir <thư-mục>  --branch "<tên chi nhánh>"  --reset
 *
 * CHẠY LẠI ĐƯỢC: mọi lệnh insert đều `onConflictDoNothing` theo khoá duy nhất nên
 * chạy hai lần không nhân đôi. Muốn nhập đè sau khi sửa nguồn thì thêm --reset
 * (chỉ xoá đúng `source = legacy-pos` của chi nhánh đó).
 *
 * KHÔNG đụng `orders` / `payments` / `register_shifts`. Bản xuất cũ chỉ có tổng theo
 * ngày nên không tái tạo được đơn thật; dựng đơn giả sẽ phá đối soát quỹ và số phiếu
 * theo ca, mà chẳng thêm được thông tin nào.
 *
 * Nằm trong packages/db/src/ (không phải scripts/) vì `drizzle-orm` chỉ được cài ở
 * packages/db/node_modules — script ở thư mục gốc không phân giải nổi.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./index";

const LEGACY_SOURCE = "legacy-pos";
const DEFAULT_BRANCH = "Chi Nhánh Chính (Nguyễn An Ninh)";
/** Postgres giới hạn 65535 tham số mỗi câu lệnh — chia lô cho an toàn. */
const BATCH_SIZE = 500;

/** packages/db/src → lên 3 cấp là thư mục gốc repo. */
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

type DailyRow = { date: string; revenue: number; orderCount: number };
type ItemRow = {
  date: string;
  code: string | null;
  name: string;
  group: string | null;
  unit: string | null;
  quantity: number;
  revenue: number;
};

/** Tiền trong bản xuất là ĐỒNG; toàn hệ thống lưu cents (×100) như `orders.total`. */
const toCents = (dong: number) => Math.round(dong * 100);

function readNdjson<T>(path: string): T[] {
  if (!existsSync(path)) {
    throw new Error(`Không thấy ${path} — chạy scripts/extract-legacy-sales.py trước.`);
  }
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const vnd = (cents: string | number) => (Number(cents) / 100).toLocaleString("vi-VN");

async function main() {
  const dir = arg("--dir") ?? join(REPO_ROOT, "data_old", "extracted");
  const branchName = arg("--branch") ?? DEFAULT_BRANCH;
  const reset = process.argv.includes("--reset");

  const daily = readNdjson<DailyRow>(join(dir, "legacy-daily.ndjson"));
  const items = readNdjson<ItemRow>(join(dir, "legacy-items.ndjson"));

  const [branch] = await db
    .select({
      id: schema.branches.id,
      organization_id: schema.branches.organization_id,
      name: schema.branches.name,
    })
    .from(schema.branches)
    .where(eq(schema.branches.name, branchName))
    .limit(1);

  if (!branch) {
    throw new Error(`Không thấy chi nhánh "${branchName}". Dùng --branch để chỉ tên khác.`);
  }

  console.log(`Chi nhánh : ${branch.name}`);
  console.log(`Nguồn     : ${LEGACY_SOURCE}`);
  console.log(`Ngày      : ${daily.length.toLocaleString()} dòng`);
  console.log(`Món×ngày  : ${items.length.toLocaleString()} dòng`);

  const scopedToLegacy = (branchCol: any, sourceCol: any) =>
    and(eq(branchCol, branch.id), eq(sourceCol, LEGACY_SOURCE));

  if (reset) {
    console.log("\n--reset: xoá dữ liệu cũ của nguồn này trước khi nhập…");
    await db
      .delete(schema.salesHistoryItems)
      .where(
        scopedToLegacy(schema.salesHistoryItems.branch_id, schema.salesHistoryItems.source),
      );
    await db
      .delete(schema.salesHistoryDaily)
      .where(
        scopedToLegacy(schema.salesHistoryDaily.branch_id, schema.salesHistoryDaily.source),
      );
  }

  const base = {
    organization_id: branch.organization_id,
    branch_id: branch.id,
    source: LEGACY_SOURCE,
  };

  console.log("\nĐang nhập doanh thu theo ngày…");
  for (let i = 0; i < daily.length; i += BATCH_SIZE) {
    await db
      .insert(schema.salesHistoryDaily)
      .values(
        daily.slice(i, i + BATCH_SIZE).map((r) => ({
          ...base,
          business_date: r.date,
          revenue: toCents(r.revenue),
          order_count: r.orderCount,
        })),
      )
      .onConflictDoNothing();
  }

  console.log("Đang nhập món × ngày…");
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    await db
      .insert(schema.salesHistoryItems)
      .values(
        items.slice(i, i + BATCH_SIZE).map((r) => ({
          ...base,
          business_date: r.date,
          item_code: r.code,
          item_name: r.name,
          group_name: r.group,
          unit: r.unit,
          // numeric() nhận CHUỖI trong drizzle — truyền số sẽ mất phần thập phân
          quantity: String(r.quantity),
          revenue: toCents(r.revenue),
        })),
      )
      .onConflictDoNothing();
  }

  // Đối chiếu lại từ chính DB, không tin con số đang giữ trong bộ nhớ.
  const [d] = await db
    .select({
      rows: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${schema.salesHistoryDaily.revenue}), 0)`,
      first: sql<string>`min(${schema.salesHistoryDaily.business_date})`,
      last: sql<string>`max(${schema.salesHistoryDaily.business_date})`,
    })
    .from(schema.salesHistoryDaily)
    .where(scopedToLegacy(schema.salesHistoryDaily.branch_id, schema.salesHistoryDaily.source));

  const [it] = await db
    .select({
      rows: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${schema.salesHistoryItems.revenue}), 0)`,
    })
    .from(schema.salesHistoryItems)
    .where(scopedToLegacy(schema.salesHistoryItems.branch_id, schema.salesHistoryItems.source));

  console.log("\nTrong DB sau khi nhập:");
  console.log(`  sales_history_daily : ${d.rows.toLocaleString()} dòng  ${d.first} → ${d.last}`);
  console.log(`                        ${vnd(d.revenue)}đ`);
  console.log(`  sales_history_items : ${it.rows.toLocaleString()} dòng`);
  console.log(`                        ${vnd(it.revenue)}đ`);

  const missing = daily.length - d.rows;
  if (missing !== 0) {
    console.warn(`\n⚠️  Lệch ${missing} dòng ngày so với file nguồn — kiểm tra lại.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
