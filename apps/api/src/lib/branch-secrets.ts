/**
 * Che khóa cổng thanh toán trước khi trả chi nhánh về cho trình duyệt.
 *
 * Vì sao cần: `branches.settings` là một cột jsonb được trả về NGUYÊN CỤC ở
 * nhiều endpoint. Từ khi có MoMo, trong đó có `secret_key` — khóa ký lệnh tiền.
 * Ai mở được trang Cài đặt là đọc được khóa, kể cả qua tab Network.
 *
 * Cách làm: trả về cờ `*_set` để giao diện biết "đã có khóa" mà hiện dấu chấm,
 * còn giá trị thật thì không bao giờ rời máy chủ. Lúc lưu, ô để trống nghĩa là
 * "giữ nguyên khóa cũ" (xem `mergeBranchSecrets`).
 */

const MASKED_KEYS = [
  ["sepay", "webhook_secret"],
  ["momo", "secret_key"],
  ["bank_push", "secret"],
] as const;

function cloneSettings(settings: unknown): Record<string, any> {
  return settings && typeof settings === "object" ? structuredClone(settings) as Record<string, any> : {};
}

/** Trả bản sao của chi nhánh đã bỏ khóa bí mật, kèm cờ `<khóa>_set`. */
export function maskBranchSecrets<T extends { settings?: unknown }>(branch: T): T {
  if (!branch) return branch;
  const settings = cloneSettings(branch.settings);
  const payment = settings.payment;
  if (payment && typeof payment === "object") {
    for (const [gateway, field] of MASKED_KEYS) {
      const cfg = payment[gateway];
      if (cfg && typeof cfg === "object") {
        cfg[`${field}_set`] = Boolean(cfg[field]);
        delete cfg[field];
      }
    }
  }
  return { ...branch, settings };
}

export function maskBranchList<T extends { settings?: unknown }>(list: T[]): T[] {
  return list.map((b) => maskBranchSecrets(b));
}

/**
 * Ghép settings người dùng gửi lên với settings đang lưu, giữ lại khóa bí mật
 * khi ô nhập để trống.
 *
 * Không có bước này thì mỗi lần ai đó bấm Lưu ở trang Cài đặt (dù chỉ sửa số
 * điện thoại) là khóa MoMo bị ghi đè thành rỗng — thanh toán tự động chết câm.
 */
export function mergeBranchSecrets(incoming: unknown, existing: unknown): Record<string, any> {
  const next = cloneSettings(incoming);
  const prev = cloneSettings(existing);

  for (const [gateway, field] of MASKED_KEYS) {
    const nextCfg = next.payment?.[gateway];
    if (!nextCfg || typeof nextCfg !== "object") continue;

    // Cờ chỉ để hiển thị, đừng để nó rơi xuống DB.
    delete nextCfg[`${field}_set`];

    const provided = typeof nextCfg[field] === "string" ? nextCfg[field].trim() : "";
    if (!provided) {
      const previous = prev.payment?.[gateway]?.[field];
      if (previous) nextCfg[field] = previous;
      else delete nextCfg[field];
    }
  }

  return next;
}
