/**
 * Làm sẵn tiếng cho những CÂU PHIẾU hay gặp — chạy sau deploy (chạy lại an toàn).
 *
 *   docker compose exec api bun run apps/api/src/scripts/tts-prewarm.ts          # giọng "nu"
 *   docker compose exec api bun run apps/api/src/scripts/tts-prewarm.ts nu nam   # nhiều giọng
 *
 * ⚠️ Phải `exec` vào container ĐANG CHẠY (không `run --rm`): tiếng ghi vào volume
 * `ttscache` mà API đọc. Mỗi câu mới 1–2 s, chạy lần lượt nên phiếu quầy lúc đó
 * chờ thêm tối đa một câu.
 *
 * Câu được dựng lại từ ĐƠN THẬT 60 ngày bằng chính `buildOrderSpeech` mà máy
 * quầy dùng — tự gõ tay danh sách là lệch một dấu là trật khoá. Chỉ làm câu lặp
 * từ 2 lần trở lên; câu lạ thì lần đầu đọc chờ tổng hợp như bình thường.
 */
import { sql } from "drizzle-orm";
import { db } from "@restai/db";
import { buildOrderSpeech, docSo, type SpeechOrderLike } from "@restai/config";
import { getSpeech } from "../services/tts.service.js";

/** Trần số câu làm sẵn — dư cho câu lặp lại; quá nữa là toàn câu chỉ gặp vài lần. */
const MAX_SENTENCES = 800;

interface OrderRow {
  table_number: number | null;
  customer_name: string | null;
  notes: string | null;
  items: Array<{ name: string; quantity: number; notes: string | null; modifiers: string[] }>;
}

async function collectSentences(): Promise<{ list: string[]; orders: number; covered: number }> {
  const orders = (await db.execute(sql`
    select t.number as table_number, o.customer_name, o.notes,
      (select coalesce(json_agg(json_build_object(
                'name', oi.name, 'quantity', oi.quantity, 'notes', oi.notes,
                'modifiers', (select coalesce(json_agg(m.name), '[]'::json)
                                from order_item_modifiers m where m.order_item_id = oi.id))
              order by oi.created_at), '[]'::json)
         from order_items oi where oi.order_id = o.id) as items
    from orders o
    left join table_sessions ts on ts.id = o.table_session_id
    left join tables t on t.id = ts.table_id
    where o.created_at > now() - interval '60 days'`)) as unknown as OrderRow[];

  const count = new Map<string, number>();
  for (const o of orders) {
    const order: SpeechOrderLike = {
      tableNumber: o.table_number,
      customerName: o.customer_name,
      orderNotes: o.notes,
      items: o.items,
    };
    const text = buildOrderSpeech(order, "full");
    if (text) count.set(text, (count.get(text) ?? 0) + 1);
  }

  const repeated = [...count.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SENTENCES);
  const covered = repeated.reduce((s, [, n]) => s + n, 0);
  const list = repeated.map(([t]) => t);

  // Câu thanh toán (station-provider.tsx) — số phiếu theo ca lên tới ~100.
  for (let n = 1; n <= 100; n++) list.push(`Phiếu ${docSo(n)}, đã thanh toán.`);

  return { list, orders: orders.length, covered };
}

async function main() {
  const voices = process.argv.slice(2).filter(Boolean);
  if (!voices.length) voices.push("nu");

  const { list, orders, covered } = await collectSentences();
  const pct = orders ? ((covered / orders) * 100).toFixed(1) : "0";
  console.log(`${orders} đơn 60 ngày — câu làm sẵn phủ ${covered} đơn (${pct}%).`);
  console.log(`Có ${list.length} câu × ${voices.length} giọng.`);

  for (const voice of voices) {
    let made = 0;
    let had = 0;
    let failed = 0;
    const t0 = Date.now();
    for (const [i, text] of list.entries()) {
      try {
        const { hit } = await getSpeech(text, voice);
        hit ? had++ : made++;
      } catch (e: any) {
        failed++;
        console.warn(`  ✗ "${text}": ${e?.message ?? e}`);
      }
      if ((i + 1) % 50 === 0) console.log(`  [${voice}] ${i + 1}/${list.length}`);
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
