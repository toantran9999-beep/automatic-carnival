/**
 * Kéo ảnh món/danh mục đang trỏ ra MÁY CHỦ NGOÀI (foodbook.vn, fabi-ai… — di sản
 * lúc nhập thực đơn từ POS cũ) về máy mình, và nén lại các ảnh của mình còn nặng.
 *
 * Vì sao (đo 19/10/2026): 12 ảnh là ảnh chụp điện thoại 4032×3024, mỗi ảnh chiếm
 * 47 MB RAM khi hiện lên — ~580 MB cho một trang thực đơn, máy POS Android đơ hẳn.
 * Lại còn nằm trên máy chủ của nhà cung cấp cũ: họ xoá là quán mất ảnh.
 *
 * Mỗi ảnh: tải về → `normalizeImage` (≤1280px, WebP) → `storeUpload` (tự sinh
 * `.thumb.webp` 320px) → đổi `image_url`.
 *
 * Chạy (trên VPS, trong /root/toda-pos):
 *   docker compose run --rm api bun run apps/api/src/scripts/import-menu-images.ts --dry-run
 *   docker compose run --rm api bun run apps/api/src/scripts/import-menu-images.ts
 *
 * - Bỏ qua: SVG (đã nhẹ), ảnh đã là `/uploads/….webp`. Chạy lại an toàn.
 * - Trước khi ghi DB, in dòng `BACKUP {json}` cho từng ảnh (id, url cũ) — giữ lại
 *   log đó để trả về được nếu cần.
 * - Ảnh tải lỗi: ghi log, GIỮ NGUYÊN url cũ, không dừng cả script.
 */
import { db, schema } from "@restai/db";
import { eq, isNotNull } from "drizzle-orm";
import { normalizeImage, storeUpload, readUpload } from "../lib/r2";

const DRY_RUN = process.argv.includes("--dry-run");
const UPLOAD_PREFIX = "/uploads/";

type Row = { table: "menu_items" | "menu_categories"; id: string; org: string; name: string; url: string };

function needsWork(url: string): boolean {
  if (/\.svg(\?|$)/i.test(url)) return false;
  if (url.startsWith(UPLOAD_PREFIX) && /\.webp$/i.test(url)) return false;
  return true;
}

function guessContentType(url: string, header: string | null): string {
  if (header && header.startsWith("image/")) return header.split(";")[0];
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

async function loadBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (url.startsWith(UPLOAD_PREFIX)) {
    const key = url.slice(UPLOAD_PREFIX.length);
    return { bytes: await readUpload(key), contentType: guessContentType(url, null) };
  }
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: guessContentType(url, res.headers.get("content-type")),
  };
}

async function main() {
  console.log(`=== Kéo ảnh thực đơn về máy mình ${DRY_RUN ? "(CHẠY THỬ — không ghi gì)" : ""} ===`);

  const items = await db
    .select({ id: schema.menuItems.id, org: schema.menuItems.organization_id, name: schema.menuItems.name, url: schema.menuItems.image_url })
    .from(schema.menuItems)
    .where(isNotNull(schema.menuItems.image_url));
  const cats = await db
    .select({ id: schema.menuCategories.id, org: schema.menuCategories.organization_id, name: schema.menuCategories.name, url: schema.menuCategories.image_url })
    .from(schema.menuCategories)
    .where(isNotNull(schema.menuCategories.image_url));

  const rows: Row[] = [
    ...items.map((r) => ({ table: "menu_items" as const, ...r, url: r.url! })),
    ...cats.map((r) => ({ table: "menu_categories" as const, ...r, url: r.url! })),
  ].filter((r) => needsWork(r.url));

  console.log(`Cần xử lý ${rows.length} ảnh.`);
  let done = 0, failed = 0, beforeKB = 0, afterKB = 0;

  for (const r of rows) {
    try {
      const src = await loadBytes(r.url);
      const out = await normalizeImage(src.bytes, src.contentType);
      if (out.contentType !== "image/webp") throw new Error("không nén được sang WebP");
      beforeKB += src.bytes.length / 1024;
      afterKB += out.bytes.length / 1024;
      const label = `${r.name} — ${(src.bytes.length / 1024) | 0}KB → ${(out.bytes.length / 1024) | 0}KB`;

      if (DRY_RUN) {
        console.log(`  • ${label}`);
        done++;
        continue;
      }

      const folder = r.table === "menu_items" ? "menu" : "category";
      const key = `${r.org}/${folder}/${crypto.randomUUID()}.webp`;
      const newUrl = await storeUpload(key, out.bytes, out.contentType);

      console.log(`BACKUP ${JSON.stringify({ table: r.table, id: r.id, old: r.url, new: newUrl })}`);
      if (r.table === "menu_items") {
        await db.update(schema.menuItems).set({ image_url: newUrl }).where(eq(schema.menuItems.id, r.id));
      } else {
        await db.update(schema.menuCategories).set({ image_url: newUrl }).where(eq(schema.menuCategories.id, r.id));
      }
      console.log(`  ✓ ${label}`);
      done++;
    } catch (err) {
      console.error(`  ✗ ${r.name} (${r.url.slice(0, 70)}) — LỖI, giữ nguyên:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log("=== Tổng kết ===");
  console.log(`${done} xong, ${failed} lỗi. Dung lượng ảnh gốc: ${(beforeKB / 1024).toFixed(1)} MB → ${(afterKB / 1024).toFixed(1)} MB`);
}

main()
  .catch((err) => {
    console.error("Script thất bại:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
