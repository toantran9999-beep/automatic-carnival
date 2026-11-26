import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";

/**
 * Thời gian thao tác đo TRÊN MÁY BẤM (máy quầy APK, điện thoại order).
 *
 * Máy chủ trả lời thanh toán ~40ms mà máy quầy vẫn thấy "cực kỳ chậm" (26/11/2026)
 * — nghĩa là chậm nằm ở máy bấm, log máy chủ không thấy được. Máy khách tự đo rồi
 * gửi về đây; route chỉ in một dòng `[perf]` ra log để đọc bằng
 * `docker compose logs api | grep "\[perf\]"`. KHÔNG ghi DB.
 *
 * Tạm thời: gỡ khi đã kết luận được nguyên nhân (xem apps/web/src/lib/perf.ts).
 */
const sampleSchema = z.object({
  name: z.enum(["mo-ban", "mo-thanh-toan", "thu-tien"]),
  ms: z.number().nonnegative().max(600_000),
  /** Số lần luồng giao diện bị khoá >50ms trong khoảng đo. */
  longTasks: z.number().int().nonnegative().max(10_000),
  /** Tổng thời gian bị khoá (ms). */
  longMs: z.number().nonnegative().max(600_000),
});

const bodySchema = z.object({
  samples: z.array(sampleSchema).min(1).max(20),
});

const perf = new Hono<AppEnv>();
perf.use("*", authMiddleware);
perf.use("*", tenantMiddleware);

perf.post("/", zValidator("json", bodySchema), (c) => {
  const user = c.get("user") as any;
  const tenant = c.get("tenant") as any;
  const { samples } = c.req.valid("json");
  for (const s of samples) {
    console.log(
      `[perf] role=${user?.role ?? "?"} branch=${tenant?.branchId ?? "-"} name=${s.name} ms=${Math.round(s.ms)} long=${s.longTasks}/${Math.round(s.longMs)}ms`,
    );
  }
  return c.json({ success: true, data: null });
});

export { perf };
