/**
 * Dựng sẵn nhóm tùy chọn cho cà phê + gộp món "(nhẹ)" vào nhóm "Độ đậm".
 *
 * Chạy:  docker compose run --rm migrate bun run src/setup-coffee-modifiers.ts
 *
 * - Idempotent: chạy lại không tạo trùng (bỏ qua nhóm/đã liên kết đã có).
 * - An toàn: món "(nhẹ)" nếu đã có đơn tham chiếu (FK) thì ẨN (is_available=false)
 *   thay vì xóa cứng; món chưa có đơn thì xóa.
 *
 * Quy ước: tùy chọn ĐẦU TIÊN của mỗi nhóm là MẶC ĐỊNH (POS tự chọn sẵn cho nhóm bắt buộc).
 */
import { db, schema } from "./index";
import { eq, and, ilike, inArray } from "drizzle-orm";

// [tên, +/- giá (VND)] — giá lưu cents nên ×100 khi insert.
const GROUPS: {
  name: string;
  required: boolean;
  min: number;
  max: number;
  mods: [string, number][];
}[] = [
  { name: "Độ đậm", required: true, min: 1, max: 1, mods: [["Đậm", 0], ["Nhẹ", 0]] },
  { name: "Đá", required: true, min: 1, max: 1, mods: [["Bình thường", 0], ["Ít đá", 0], ["Không đá", 0]] },
  { name: "Đường", required: true, min: 1, max: 1, mods: [["Bình thường", 0], ["Ít ngọt", 0], ["Không đường", 0]] },
  { name: "Sữa", required: false, min: 0, max: 1, mods: [["Bình thường", 0], ["Ít sữa", 0], ["Nhiều sữa", 3000], ["Không sữa", 0]] },
  { name: "Loại hạt", required: false, min: 0, max: 1, mods: [["Robusta truyền thống", 0], ["Arabica", 5000], ["Culi", 3000], ["Mộc (giảm)", -2000]] },
];

async function setupForBranch(orgId: string, branchId: string) {
  // 1) Tạo / lấy các nhóm tùy chọn
  const groupIdByName: Record<string, string> = {};
  for (let gi = 0; gi < GROUPS.length; gi++) {
    const g = GROUPS[gi];
    const [existing] = await db
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(and(eq(schema.modifierGroups.branch_id, branchId), eq(schema.modifierGroups.name, g.name)))
      .limit(1);

    if (existing) {
      groupIdByName[g.name] = existing.id;
      // Cập nhật thứ tự nhóm + thứ tự tùy chọn (sửa data cũ sort_order=0).
      await db
        .update(schema.modifierGroups)
        .set({ sort_order: gi })
        .where(eq(schema.modifierGroups.id, existing.id));
      for (let i = 0; i < g.mods.length; i++) {
        await db
          .update(schema.modifiers)
          .set({ sort_order: i })
          .where(and(eq(schema.modifiers.group_id, existing.id), eq(schema.modifiers.name, g.mods[i][0])));
      }
      console.log(`  • Nhóm "${g.name}" đã có — cập nhật thứ tự (${gi}) + tùy chọn.`);
      continue;
    }

    const [grp] = await db
      .insert(schema.modifierGroups)
      .values({
        branch_id: branchId,
        organization_id: orgId,
        name: g.name,
        min_selections: g.min,
        max_selections: g.max,
        is_required: g.required,
        sort_order: gi,
      })
      .returning({ id: schema.modifierGroups.id });

    await db.insert(schema.modifiers).values(
      g.mods.map(([name, vnd], i) => ({
        group_id: grp.id,
        name,
        price: vnd * 100,
        is_available: true,
        sort_order: i,
      })),
    );
    groupIdByName[g.name] = grp.id;
    console.log(`  ✓ Tạo nhóm "${g.name}" (${g.mods.length} tùy chọn).`);
  }

  // 2) Tìm các món thuộc danh mục CÀ PHÊ (pha) để gắn nhóm
  const coffeeCats = await db
    .select({ id: schema.menuCategories.id, name: schema.menuCategories.name })
    .from(schema.menuCategories)
    .where(and(eq(schema.menuCategories.branch_id, branchId), ilike(schema.menuCategories.name, "%cà phê%")));
  // Chỉ lấy danh mục "CÀ PHÊ" thuần (bỏ "CÀ PHÊ BỘT HẠT" = cà phê đóng gói)
  const drinkCatIds = coffeeCats.filter((c) => !/bột|hạt/i.test(c.name)).map((c) => c.id);
  if (drinkCatIds.length === 0) {
    console.log("  ! Không tìm thấy danh mục CÀ PHÊ pha — bỏ qua gắn nhóm.");
    return;
  }

  const coffeeItems = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name })
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.category_id, drinkCatIds));

  // 3) Gắn tất cả nhóm vào các món cà phê pha (bỏ qua nếu đã gắn)
  const allGroupIds = Object.values(groupIdByName);
  let links = 0;
  for (const item of coffeeItems) {
    for (const gid of allGroupIds) {
      const ins = await db
        .insert(schema.menuItemModifierGroups)
        .values({ item_id: item.id, group_id: gid })
        .onConflictDoNothing()
        .returning({ item_id: schema.menuItemModifierGroups.item_id });
      links += ins.length;
    }
  }
  console.log(`  ✓ Gắn nhóm vào ${coffeeItems.length} món cà phê (thêm ${links} liên kết mới).`);

  // 3b) Gỡ nhóm GỘP cũ "Đường / sữa / đá" khỏi các món cà phê (đã có nhóm tách riêng) để khỏi trùng.
  const OLD_COMBINED = ["Đường / sữa / đá", "Đường/Sữa/Đá", "Đường, sữa, đá"];
  const itemIds = coffeeItems.map((i) => i.id);
  for (const oldName of OLD_COMBINED) {
    const [oldGrp] = await db
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(and(eq(schema.modifierGroups.branch_id, branchId), eq(schema.modifierGroups.name, oldName)))
      .limit(1);
    if (!oldGrp || itemIds.length === 0) continue;
    const del = await db
      .delete(schema.menuItemModifierGroups)
      .where(
        and(
          eq(schema.menuItemModifierGroups.group_id, oldGrp.id),
          inArray(schema.menuItemModifierGroups.item_id, itemIds),
        ),
      )
      .returning({ item_id: schema.menuItemModifierGroups.item_id });
    if (del.length > 0) console.log(`  ✓ Gỡ nhóm gộp cũ "${oldName}" khỏi ${del.length} món cà phê.`);
  }

  // 4) Gộp món "(nhẹ)": gắn nhóm Độ đậm cho món gốc (đã làm ở B3) rồi bỏ món lẻ
  const lightRe = /\s*\(\s*nh[eẹ]\s*\)\s*$/i;
  const nameToId = new Map(coffeeItems.map((i) => [i.name.trim().toLowerCase(), i.id]));
  let deleted = 0;
  let hidden = 0;
  for (const item of coffeeItems) {
    if (!lightRe.test(item.name)) continue;
    const baseName = item.name.replace(lightRe, "").trim().toLowerCase();
    const baseId = nameToId.get(baseName);
    if (!baseId) {
      console.log(`  · Giữ "${item.name}" (không thấy món gốc "${baseName}").`);
      continue;
    }
    // Thử xóa; nếu vướng FK (đã có đơn) thì ẩn đi.
    try {
      await db.delete(schema.menuItems).where(eq(schema.menuItems.id, item.id));
      deleted++;
      console.log(`  ✓ Xóa món lẻ "${item.name}" (gộp vào "${baseName}" + Độ đậm: Nhẹ).`);
    } catch {
      await db
        .update(schema.menuItems)
        .set({ is_available: false })
        .where(eq(schema.menuItems.id, item.id));
      hidden++;
      console.log(`  ⚠ "${item.name}" có đơn tham chiếu → ẨN thay vì xóa.`);
    }
  }
  console.log(`  ✓ Gộp (nhẹ): xóa ${deleted}, ẩn ${hidden}.`);
}

async function main() {
  console.log("🍵 Dựng nhóm tùy chọn cà phê...");
  const branches = await db
    .select({ id: schema.branches.id, organization_id: schema.branches.organization_id, name: schema.branches.name })
    .from(schema.branches);
  for (const b of branches) {
    console.log(`\n== Chi nhánh: ${b.name} ==`);
    await setupForBranch(b.organization_id, b.id);
  }
  console.log("\n🎉 Hoàn tất.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Lỗi:", e);
  process.exit(1);
});
