/**
 * Giá shot của HẠT ĐẮT (Brazil / Cầu Đất) — cùng một ly thì máy lấy GIÁ CAO HƠN.
 *
 * Vì sao có (anh Toàn báo 27/11/2026): cùng một ly "1 shot Brazil + 2 shot Robusta"
 * bấm theo hai cách ra hai giá:
 *   - Cà phê đá 15k + "Thêm 1 shot cà phê Brazil" 8k            = 23k  ← lỗ nặng
 *   - ly 1 shot Brazil (15 − Nhẹ 2 + Arabica Brazil 10) = 23k
 *     + 2 shot Robusta (2 × 5k)                                  = 33k  ← đúng
 * Anh chốt: tính cả hai, LẤY SỐ LỚN HƠN.
 *
 * Bảng anh đã duyệt (đơn vị nghìn đồng) — đổi hàm này thì phải còn ra đúng bảng:
 *
 *   Cà phê đá + 1 shot Brazil                    23 → 33
 *   Cà phê đá Nhẹ + 1 shot Brazil                21 → 28
 *   Cà phê đá + 1 shot Cầu Đất                   22 → 30
 *   Cà phê đá + 1 shot Brazil + thêm 1 shot      28 → 38
 *   Cà phê đá Mix + 1 shot Brazil                27 → 33
 *   Cà phê đá Cầu Đất + 1 shot Brazil            30 → 33
 *   Cà phê đá Brazil + 1 shot Brazil             33 (giữ nguyên)
 *   Cà phê đá + thêm 1 / 2 shot thường           20 / 25 (giữ nguyên)
 *
 * Cách tính "cách 2": coi 1 shot hạt đắt nhất là NỀN của ly (ly Nhẹ của hạt đó),
 * mọi shot còn lại là shot thêm giá thường:
 *     giá Nhẹ + phụ thu hạt đắt + (tổng shot − 1) × giá shot thường
 * với tổng shot = 2 (ly mặc định là double) + Σ `shots` của tùy chọn đã chọn.
 *
 * ⚠️ Chỉ áp cho món có CẢ nút Nhẹ (`shots = −1`) lẫn shot thường (`shots = 1`,
 * không trỏ hạt). Thiếu một trong hai = không biết ly gốc mấy shot (Bạc xỉu, món
 * sữa) → giữ nguyên giá, đúng như anh dặn.
 *
 * ⚠️ Phần chênh được CỘNG VÀO GIÁ của dòng shot hạt đắt (vd "+18.000"), không tạo
 * dòng mới — nhờ vậy bất biến `Σ(unit_price + Σ mod.price) × qty = tổng` vẫn giữ, và
 * in phiếu / báo cáo / Excel (đều đọc giá đã chụp) không phải sửa gì.
 *
 * Tiền tính theo XU như mọi chỗ khác. Hàm thuần — máy chủ (`resolveOrderItems`) và
 * POS (`modifier-dialog`) gọi CÙNG hàm này, lệch nhau là giỏ hiện một số, phiếu ra số khác.
 */

export interface BeanShotModifier {
  id: string;
  group_id: string;
  /** Xu. Âm = giảm giá (Nhẹ). */
  price: number;
  /** Số shot tùy chọn này thêm/bớt. null = không liên quan shot. */
  shots?: number | null;
  /** Shot của loại hạt nào — id tùy chọn trong nhóm Loại hạt. */
  shot_bean_id?: string | null;
}

/**
 * @param attached MỌI tùy chọn thuộc các nhóm gắn với món (không chỉ cái đã chọn).
 * @param selectedIds id tùy chọn đã chọn, theo đúng thứ tự dòng món (được trùng).
 * @returns giá (xu) của từng tùy chọn đã chọn, cùng thứ tự với `selectedIds`.
 *          Tùy chọn không tra ra trong `attached` trả về giá 0 — người gọi tự chặn.
 */
export function applyBeanShotPricing(
  attached: BeanShotModifier[],
  selectedIds: string[],
): number[] {
  const byId = new Map(attached.map((m) => [m.id, m]));
  const selected = selectedIds.map((id) => byId.get(id));
  const prices = selected.map((m) => m?.price ?? 0);

  // 1) Món phải có cả nút Nhẹ lẫn shot thường mới biết ly gốc là double.
  const light = attached.find((m) => m.shots === -1);
  const plainShot = attached.find((m) => m.shots === 1 && !m.shot_bean_id);
  if (!light || !plainShot) return prices;

  const beanPrice = (beanId: string) => byId.get(beanId)?.price ?? 0;
  // Nhóm Loại hạt = nhóm chứa các tùy chọn được shot hạt trỏ tới.
  const beanGroupIds = new Set<string>();
  for (const m of attached) {
    if (!m.shot_bean_id) continue;
    const bean = byId.get(m.shot_bean_id);
    if (bean) beanGroupIds.add(bean.group_id);
  }

  // 2) Shot hạt đắt nhất trong các tùy chọn đã chọn.
  let bestIdx = -1;
  let bestBean = 0;
  selected.forEach((m, i) => {
    if (!m?.shot_bean_id) return;
    const p = beanPrice(m.shot_bean_id);
    if (bestIdx === -1 || p > bestBean) {
      bestIdx = i;
      bestBean = p;
    }
  });
  if (bestIdx === -1) return prices;

  // 3) Hạt của cả ly (chọn ở nhóm Loại hạt; không chọn = Robusta, phụ thu 0).
  //    Ly đã là hạt đắt bằng/hơn thì shot thêm không đổi gì về hạt nền.
  let cupBean = 0;
  for (const m of selected) {
    if (m && beanGroupIds.has(m.group_id)) cupBean = Math.max(cupBean, m.price);
  }
  if (bestBean <= cupBean) return prices;

  // 4) Hai cách tính, chỉ trên các tùy chọn dính tới shot/hạt.
  let totalShots = 2;
  let current = 0;
  selected.forEach((m, i) => {
    if (!m) return;
    const related = (m.shots !== null && m.shots !== undefined) || beanGroupIds.has(m.group_id);
    if (!related) return;
    totalShots += m.shots ?? 0;
    current += prices[i];
  });
  const alternative = light.price + bestBean + (totalShots - 1) * plainShot.price;

  // 5) Lấy số lớn hơn — phần chênh dồn vào dòng shot hạt đắt.
  if (alternative > current) prices[bestIdx] += alternative - current;
  return prices;
}
