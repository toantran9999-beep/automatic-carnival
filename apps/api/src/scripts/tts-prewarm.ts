/**
 * Làm sẵn mảnh tiếng cho loa trạm quầy — chạy MỘT lần sau deploy (chạy lại an toàn).
 *
 *   docker compose exec api bun run apps/api/src/scripts/tts-prewarm.ts          # giọng "nu"
 *   docker compose exec api bun run apps/api/src/scripts/tts-prewarm.ts nu nam   # nhiều giọng
 *
 * ⚠️ Phải `exec` vào container ĐANG CHẠY (không `run --rm`): mảnh ghi vào volume
 * `ttscache` mà API đọc. Mỗi mảnh mới ~0,7 s; ~400 mảnh ≈ 5 phút cho một giọng.
 * Service TTS xử lý tuần tự nên phiếu quầy lúc đó chờ thêm tối đa một mảnh (~1 s).
 *
 * Mảnh được dựng bằng CHÍNH `buildOrderSpeech` + `speechSegments` mà máy quầy và
 * API dùng — tự gõ tay danh sách chữ là lệch một dấu là trật khoá.
 */
import { sql } from "drizzle-orm";
import { db } from "@restai/db";
import { buildOrderSpeech, docSo, speechSegments, type SpeechOrderLike } from "@restai/config";
import { getSegment } from "../services/tts.service.js";

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}

async function collectSegments(): Promise<string[]> {
  const set = new Set<string>();
  const add = (order: SpeechOrderLike) => {
    const text = buildOrderSpeech(order, "full");
    if (text) for (const s of speechSegments(text)) set.add(s.text);
  };
  const addText = (text: string) => {
    for (const s of speechSegments(text)) set.add(s.text);
  };

  // Cụm "số lượng + món" thật sự đã bán 60 ngày, cộng món đang bán × 1–2 ly.
  const sold = await rows<{ name: string; quantity: number }>(sql`
    select distinct oi.name, oi.quantity
    from order_items oi join orders o on o.id = oi.order_id
    where o.created_at > now() - interval '60 days' and oi.quantity between 1 and 9`);
  const menu = await rows<{ name: string }>(sql`
    select distinct name from menu_items where is_available = true`);
  const dummy = menu[0]?.name ?? sold[0]?.name ?? "Cà phê";

  for (const r of sold) add({ items: [{ name: r.name, quantity: r.quantity }] });
  for (const r of menu) for (const q of [1, 2]) add({ items: [{ name: r.name, quantity: q }] });

  // Tùy chọn: tên đã chốt trên đơn (có cả số gõ tay "Đường 11g") + tùy chọn đang bật.
  const mods = await rows<{ name: string }>(sql`
    select distinct m.name from order_item_modifiers m
      join order_items oi on oi.id = m.order_item_id join orders o on o.id = oi.order_id
     where o.created_at > now() - interval '60 days'
    union select distinct name from modifiers where is_available = true`);
  for (const r of mods) add({ items: [{ name: dummy, quantity: 1, modifiers: [r.name] }] });

  // Ghi chú món + ghi chú đơn + tên khách hay gặp.
  const notes = await rows<{ t: string }>(sql`
    (select trim(oi.notes) t from order_items oi join orders o on o.id = oi.order_id
      where o.created_at > now() - interval '60 days' and coalesce(trim(oi.notes),'') <> ''
      group by 1 order by count(*) desc limit 80)
    union
    (select trim(notes) t from orders
      where created_at > now() - interval '60 days' and coalesce(trim(notes),'') <> ''
      group by 1 order by count(*) desc limit 40)
    union
    (select trim(customer_name) t from orders
      where created_at > now() - interval '60 days' and coalesce(trim(customer_name),'') <> ''
      group by 1 order by count(*) desc limit 40)`);
  for (const r of notes) add({ customerName: r.t, items: [] });

  // Đầu câu: mọi bàn, mang về, thêm món, in lại.
  const tbl = await rows<{ number: number }>(sql`select distinct number from tables`);
  for (const r of tbl) add({ tableNumber: r.number, items: [] });
  add({ items: [] });
  add({ addOnId: "x", items: [] });
  add({ reprintToken: "x", items: [] });

  // Câu cảnh báo / thanh toán (station-provider.tsx) — số phiếu theo ca lên tới ~100.
  for (let n = 1; n <= 120; n++) addText(`Phiếu ${docSo(n)}.`);
  addText("Lỗi in. Thiếu tờ in. Kiểm tra máy in. đã thanh toán. Trạm quầy mất kết nối. Kiểm tra mạng.");

  return [...set];
}

async function main() {
  const voices = process.argv.slice(2).filter(Boolean);
  if (!voices.length) voices.push("nu");

  const segments = await collectSegments();
  console.log(`Có ${segments.length} mảnh × ${voices.length} giọng.`);

  for (const voice of voices) {
    let made = 0;
    let had = 0;
    let failed = 0;
    const t0 = Date.now();
    for (const [i, text] of segments.entries()) {
      try {
        const { hit } = await getSegment(text, voice);
        hit ? had++ : made++;
      } catch (e: any) {
        failed++;
        console.warn(`  ✗ "${text}": ${e?.message ?? e}`);
      }
      if ((i + 1) % 50 === 0) console.log(`  [${voice}] ${i + 1}/${segments.length}`);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`Giọng "${voice}": làm mới ${made}, có sẵn ${had}, hỏng ${failed} — ${secs}s.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
