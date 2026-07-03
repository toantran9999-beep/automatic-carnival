/**
 * Sinh bản thumbnail (~320px) cho toàn bộ ảnh ĐÃ CÓ SẴN chưa có thumbnail.
 * Không đụng DB — thumbnail suy ra từ tên file theo quy ước (abc.jpg -> abc.thumb.jpg).
 *
 * Chạy:  docker compose run --rm api bun run apps/api/src/scripts/backfill-thumbnails.ts
 *
 * - Idempotent: bỏ qua ảnh đã có thumbnail sẵn, chạy lại an toàn.
 * - Lỗi ở 1 ảnh không dừng cả script, chỉ log và tiếp tục.
 */
import {
  listAllKeys,
  existsUpload,
  readUpload,
  writeLocalOrR2,
  toThumbKey,
  isThumbKey,
  generateThumbnail,
} from "../lib/r2";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function contentTypeFor(key: string): string | null {
  const ext = key.split(".").pop()?.toLowerCase();
  return ext ? CONTENT_TYPE_BY_EXT[ext] ?? null : null;
}

async function processInBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function main() {
  console.log("=== Backfill thumbnail ảnh sản phẩm ===");

  const allKeys = await listAllKeys();
  const originals = allKeys.filter((k) => IMAGE_EXT.test(k) && !isThumbKey(k));
  console.log(`Tìm thấy ${allKeys.length} file, ${originals.length} ảnh gốc cần kiểm tra.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  await processInBatches(originals, 5, async (key) => {
    const thumbKey = toThumbKey(key);
    if (thumbKey === key) {
      console.log(`  • ${key} — bỏ qua (không xác định được đuôi file)`);
      skipped++;
      return;
    }

    try {
      if (await existsUpload(thumbKey)) {
        skipped++;
        return;
      }

      const contentType = contentTypeFor(key);
      if (!contentType) {
        console.log(`  • ${key} — bỏ qua (đuôi file không hỗ trợ)`);
        skipped++;
        return;
      }

      const body = await readUpload(key);
      const thumb = await generateThumbnail(body, contentType);
      if (!thumb) {
        console.error(`  ✗ ${key} — LỖI: không sinh được thumbnail`);
        failed++;
        return;
      }

      await writeLocalOrR2(thumbKey, thumb.bytes, thumb.contentType);
      console.log(`  • ${key} — đã tạo ${thumbKey}`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${key} — LỖI:`, err instanceof Error ? err.message : err);
      failed++;
    }
  });

  console.log("=== Tổng kết ===");
  console.log(
    `Tổng: ${originals.length} ảnh, ${created} tạo mới, ${skipped} bỏ qua, ${failed} lỗi.`,
  );
}

main()
  .catch((err) => {
    console.error("Script thất bại:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
