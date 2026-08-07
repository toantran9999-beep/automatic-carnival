/**
 * Dựng danh mục nguyên liệu thật của quán cà phê Toda, rút từ SOP Mục IV
 * (TODA-CAFE-SOP-2026-CHUTHICH.docx).
 *
 * Chạy:  docker compose run --rm migrate bun run src/setup-toda-inventory.ts
 *
 * - Idempotent: khớp theo TÊN, chạy lại chỉ cập nhật đơn vị/quy cách, không tạo trùng.
 * - Xoá hẳn dữ liệu mẫu của khuôn nhà hàng (Gạo, Thịt gà, Bánh phở…). Xoá được vì
 *   inventory_movements và recipe_ingredients đều khai ON DELETE CASCADE, và mấy dòng
 *   lịch sử đó cũng là dữ liệu giả nốt.
 *
 * ⚠️ ĐƠN VỊ NỀN LÀ g / ml. SOP viết theo g/ml nên kho cũng đếm theo g/ml — quy đổi từ
 * "1 lon", "1 bao" sang đơn vị nền là việc của `pack_size`, làm đúng MỘT chỗ.
 */
import { db, schema } from "./index";
import { and, eq, inArray, sql } from "drizzle-orm";

type Ing = {
  name: string;
  /** Đơn vị nền — g, ml, hoặc đơn vị đếm được (túi, gói, trái, hũ, cái). */
  unit: string;
  /** Quy cách một lần nhập: [số đơn vị nền, chữ hiện cho người dùng] */
  pack?: [number, string];
  /** Dưới mức này thì trang Kho hàng báo đỏ. */
  min?: number;
};

const CATEGORIES: { name: string; items: Ing[] }[] = [
  {
    // Mỗi lô hạt là MỘT nguyên liệu riêng, tên ghi đủ giống + vùng trồng — đó là thứ
    // quyết định giá nhập lẫn vị. "Hạt Arabica" trống không thì tháng sau đổi lô là
    // không ai biết đang trừ vào bao nào.
    name: "Hạt cà phê",
    items: [
      // Hai loại hạt GỐC quán tự rang, theo bảng giá sỉ B2B: Robusta Đắk Lắk và
      // Robusta mật ong. Mọi loại Toda 1–4 chỉ là hai thứ này trộn theo tỉ lệ khác
      // nhau, nên kho chỉ đếm hai bao — không đẻ thêm "bao Toda 2" nào cả.
      { name: "Hạt Robusta — Đắk Lắk", unit: "g", pack: [1000, "bao 1kg"], min: 3000 },
      { name: "Hạt Robusta mật ong", unit: "g", pack: [1000, "bao 1kg"], min: 2000 },
      // Hai lô Arabica chỉ dùng cho món uống tại quán (tùy chọn "Loại hạt").
      { name: "Hạt Arabica — Cầu Đất", unit: "g", pack: [1000, "bao 1kg"], min: 1000 },
      { name: "Hạt Arabica — Brazil Cerrado", unit: "g", pack: [1000, "bao 1kg"], min: 1000 },
      // ⚠️ "Blend" và "Mix" là tên tùy chọn trên POS, CHƯA rõ trộn từ gì. Để riêng
      // một bao cho tới khi anh Toàn xác nhận — nếu thật ra chúng là Toda 2 / Toda 3
      // thì gộp lại sau, đừng đoán.
      { name: "Hạt Blend", unit: "g", pack: [1000, "bao 1kg"], min: 1000 },
      { name: "Hạt Mix", unit: "g", pack: [1000, "bao 1kg"], min: 1000 },
    ],
  },
  {
    name: "Sữa & kem",
    items: [
      { name: "Sữa đặc", unit: "g", pack: [380, "lon 380g"], min: 1140 },
      { name: "Sữa tươi", unit: "ml", pack: [1000, "hộp 1L"], min: 2000 },
      { name: "Whipping cream", unit: "g", pack: [1000, "hộp 1L"], min: 500 },
      { name: "Sữa chua", unit: "hũ", pack: [4, "lốc 4 hũ"], min: 8 },
    ],
  },
  {
    // ⚠️ Đường vàng (g) và nước đường (ml) là HAI nguyên liệu khác nhau, đừng gộp:
    // nhóm cà phê trong SOP ghi theo g (đường vàng bao 1kg), nhóm trà/soda ghi theo
    // ml (nước đường đã nấu).
    name: "Đường & phụ gia",
    items: [
      { name: "Đường vàng", unit: "g", pack: [1000, "bao 1kg"], min: 2000 },
      { name: "Nước đường", unit: "ml", pack: [1000, "chai 1L"], min: 1000 },
      { name: "Muối", unit: "g", pack: [500, "gói 500g"], min: 200 },
      { name: "Bột xanthan", unit: "g", pack: [100, "gói 100g"], min: 50 },
      { name: "Caramel", unit: "g", pack: [1000, "chai 1kg"], min: 300 },
      { name: "Hạnh nhân", unit: "g", pack: [500, "hũ 500g"], min: 200 },
    ],
  },
  {
    name: "Trà",
    items: [
      { name: "Túi lọc Lipton", unit: "túi", pack: [25, "hộp 25 túi"], min: 50 },
      { name: "Gói trà xanh", unit: "gói", pack: [25, "hộp 25 gói"], min: 25 },
      { name: "Bông cúc", unit: "g", pack: [100, "gói 100g"], min: 50 },
      { name: "Atiso đỏ", unit: "g", pack: [100, "gói 100g"], min: 50 },
      { name: "Bột quế", unit: "g", pack: [100, "hũ 100g"], min: 30 },
    ],
  },
  {
    name: "Trái cây & mứt",
    items: [
      { name: "Chanh", unit: "g", pack: [1000, "kg"], min: 500 },
      { name: "Tắc", unit: "trái", pack: [100, "kg (~100 trái)"], min: 100 },
      { name: "Xí muội", unit: "trái", pack: [100, "gói 100 trái"], min: 50 },
      { name: "Dâu tây", unit: "trái", pack: [40, "hộp ~40 trái"], min: 20 },
      { name: "Mâm xôi đỏ", unit: "g", pack: [500, "hộp 500g"], min: 200 },
      { name: "Việt quất", unit: "trái", pack: [80, "hộp ~80 trái"], min: 40 },
      { name: "Mứt việt quất", unit: "g", pack: [1000, "hũ 1kg"], min: 300 },
      { name: "Mứt đào", unit: "g", pack: [1000, "hũ 1kg"], min: 300 },
    ],
  },
  {
    name: "Syrup",
    items: [
      { name: "Syrup bạc hà", unit: "ml", pack: [750, "chai 750ml"], min: 300 },
      { name: "Syrup đào", unit: "ml", pack: [750, "chai 750ml"], min: 300 },
    ],
  },
  {
    name: "Bột pha chế",
    items: [
      { name: "Bột cacao", unit: "g", pack: [500, "gói 500g"], min: 200 },
      { name: "Bột matcha", unit: "g", pack: [500, "gói 500g"], min: 200 },
    ],
  },
  {
    name: "Khác",
    items: [
      { name: "Soda", unit: "g", pack: [1500, "chai 1.5L"], min: 3000 },
      { name: "Đá viên", unit: "g", pack: [10000, "bao 10kg"], min: 10000 },
      { name: "Nước lọc", unit: "ml", pack: [20000, "bình 20L"], min: 20000 },
    ],
  },
  {
    name: "Bao bì",
    items: [
      // Quán chỉ có hai cỡ ly: 360ml (mặc định) và 700ml (Americano, soda).
      { name: "Ly nhựa 360ml", unit: "cái", pack: [50, "lốc 50 cái"], min: 100 },
      { name: "Ly nhựa 700ml", unit: "cái", pack: [50, "lốc 50 cái"], min: 100 },
      { name: "Nắp ly", unit: "cái", pack: [50, "lốc 50 cái"], min: 100 },
      { name: "Ống hút", unit: "cái", pack: [100, "gói 100 cái"], min: 200 },
      { name: "Túi chữ T", unit: "cái", pack: [100, "xấp 100 cái"], min: 200 },
    ],
  },
  {
    // Hàng bán nguyên gói: không pha chế gì, công thức là 1 đơn vị của chính nó.
    // Tên khớp đúng tên món trên thực đơn để script công thức tự nối được.
    name: "Hàng bán sẵn",
    items: [
      { name: "Thuốc lá Sài Gòn bạc", unit: "gói", min: 5 },
      { name: "Thuốc lá Con Mèo nhỏ", unit: "gói", min: 5 },
      { name: "Thuốc lá 555", unit: "gói", min: 3 },
      { name: "Hột quẹt", unit: "cái", min: 5 },
      { name: "Nước suối Lavie", unit: "chai", pack: [24, "thùng 24 chai"], min: 24 },
    ],
  },
];

/**
 * Dữ liệu mẫu của khuôn nhà hàng — xoá hẳn, quán cà phê không dùng tới.
 *
 * Kèm "Hạt Arabica — Ethiopia Sidamo": lô đó do bản seed đầu đoán ra, quán không
 * bán. Thực tế POS có "Arabica Cầu Đất". Xoá cho khỏi lẫn.
 */
const DEMO_ITEMS = [
  "Gạo",
  "Thịt gà",
  "Bánh phở",
  "Trà",
  "Nước mắm",
  "Rau thơm",
  "Hành lá",
  "Hạt Arabica — Ethiopia Sidamo",
];
const DEMO_CATEGORIES = ["Nguyên liệu chính"];

/**
 * Đổi tên nguyên liệu TẠI CHỖ (giữ nguyên id) — cũ → mới.
 *
 * ⚠️ Phải đổi tên chứ không được xoá rồi tạo lại: `recipe_ingredients` và
 * `modifier_ingredients` trỏ vào id, mà cả hai đều ON DELETE CASCADE — xoá là
 * cuốn theo toàn bộ công thức đã nạp, im lặng.
 *
 * Vì sao có mục này: bản seed đầu tôi đặt "Hạt Robusta — Cầu Đất" theo phỏng đoán.
 * Bảng giá sỉ B2B của quán ghi rõ Robusta là **Đắk Lắk**, và loại mật ong không kèm
 * vùng trồng.
 */
const RENAMES: [from: string, to: string][] = [
  ["Hạt Robusta — Cầu Đất", "Hạt Robusta — Đắk Lắk"],
  ["Hạt Honey Robusta — Cầu Đất", "Hạt Robusta mật ong"],
  // Tên do sửa tay trên giao diện (đúng vùng trồng, chỉ khác cách gọi). Gom về
  // đúng tên trong bảng giá sỉ để công thức và kho cùng trỏ một bao.
  ["Hạt Honey Robusta — Đắk Lắk", "Hạt Robusta mật ong"],
];

/** Cấp mã nội bộ TODA-0001 tăng dần trong phạm vi một chi nhánh. */
async function nextInternalCode(branchId: string): Promise<string> {
  const rows = await db
    .select({ code: schema.inventoryItems.internal_code })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.branch_id, branchId));

  let max = 0;
  for (const r of rows) {
    const m = /^TODA-(\d+)$/.exec(r.code ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TODA-${String(max + 1).padStart(4, "0")}`;
}

async function setupForBranch(orgId: string, branchId: string) {
  // 1) Xoá dữ liệu mẫu. CASCADE cuốn theo movements + recipe_ingredients của chúng.
  const demo = await db
    .select({ id: schema.inventoryItems.id, name: schema.inventoryItems.name })
    .from(schema.inventoryItems)
    .where(
      and(
        eq(schema.inventoryItems.branch_id, branchId),
        inArray(schema.inventoryItems.name, DEMO_ITEMS),
      ),
    );

  if (demo.length > 0) {
    await db
      .delete(schema.inventoryItems)
      .where(inArray(schema.inventoryItems.id, demo.map((d) => d.id)));
    console.log(`  ✓ Xoá ${demo.length} nguyên liệu mẫu: ${demo.map((d) => d.name).join(", ")}`);
  }

  // 1b) Đổi tên tại chỗ — chỉ đổi khi tên MỚI chưa tồn tại, kẻo đụng unique index
  //     và kẻo chạy lần hai lại ghi đè một nguyên liệu hợp lệ.
  for (const [from, to] of RENAMES) {
    const [old] = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(
        and(eq(schema.inventoryItems.branch_id, branchId), eq(schema.inventoryItems.name, from)),
      )
      .limit(1);
    if (!old) continue;

    const [clash] = await db
      .select({
        id: schema.inventoryItems.id,
        stock: schema.inventoryItems.current_stock,
      })
      .from(schema.inventoryItems)
      .where(
        and(eq(schema.inventoryItems.branch_id, branchId), eq(schema.inventoryItems.name, to)),
      )
      .limit(1);

    if (clash) {
      // Tên mới đã có sẵn. Xảy ra khi lần chạy trước đã tạo mới nó vì tên cũ bị
      // sửa tay trên giao diện nên vòng đổi tên không nhận ra.
      //
      // Chỉ dọn được khi bao trùng tên còn RỖNG HOÀN TOÀN — không tồn, không công
      // thức, không tùy chọn nào trỏ vào. Còn dính một thứ là DỪNG và báo ra:
      // gộp hai bao đều có dữ liệu là quyết định của người, không phải của script.
      const [{ refs }] = await db
        .select({
          refs: sql<number>`(
            (SELECT count(*) FROM ${schema.recipeIngredients}
              WHERE ${schema.recipeIngredients.inventory_item_id} = ${clash.id})
          + (SELECT count(*) FROM ${schema.modifierIngredients}
              WHERE ${schema.modifierIngredients.inventory_item_id} = ${clash.id}
                 OR ${schema.modifierIngredients.replaces_item_id} = ${clash.id})
          + (SELECT count(*) FROM ${schema.inventoryMovements}
              WHERE ${schema.inventoryMovements.item_id} = ${clash.id})
          )::int`,
        })
        .from(sql`(SELECT 1) AS _`);

      if (refs > 0 || parseFloat(clash.stock) !== 0) {
        console.log(
          `  ! DỪNG đổi tên "${from}" → "${to}": cả hai bao đều đang có dữ liệu. Gộp tay rồi chạy lại.`,
        );
        continue;
      }

      await db.delete(schema.inventoryItems).where(eq(schema.inventoryItems.id, clash.id));
      console.log(`  · Dọn bao rỗng trùng tên "${to}" để nhường chỗ cho bao đang dùng.`);
    }

    await db
      .update(schema.inventoryItems)
      .set({ name: to })
      .where(eq(schema.inventoryItems.id, old.id));
    console.log(`  ✓ Đổi tên "${from}" → "${to}" (giữ nguyên tồn kho & công thức).`);
  }

  // 2) Nhóm nguyên liệu
  const catIdByName: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const [existing] = await db
      .select({ id: schema.inventoryCategories.id })
      .from(schema.inventoryCategories)
      .where(
        and(
          eq(schema.inventoryCategories.branch_id, branchId),
          eq(schema.inventoryCategories.name, cat.name),
        ),
      )
      .limit(1);

    if (existing) {
      catIdByName[cat.name] = existing.id;
      continue;
    }

    const [created] = await db
      .insert(schema.inventoryCategories)
      .values({ branch_id: branchId, organization_id: orgId, name: cat.name })
      .returning({ id: schema.inventoryCategories.id });
    catIdByName[cat.name] = created.id;
  }

  // 3) Nguyên liệu
  let created = 0;
  let updated = 0;
  for (const cat of CATEGORIES) {
    for (const ing of cat.items) {
      const [packSize, packLabel] = ing.pack ?? [1, null];

      const [existing] = await db
        .select({ id: schema.inventoryItems.id, internal_code: schema.inventoryItems.internal_code })
        .from(schema.inventoryItems)
        .where(
          and(
            eq(schema.inventoryItems.branch_id, branchId),
            eq(schema.inventoryItems.name, ing.name),
          ),
        )
        .limit(1);

      if (existing) {
        // Cập nhật quy cách/đơn vị, nhưng KHÔNG đụng tới current_stock — đó là số
        // đếm thật của quán, chạy lại script mà đè lên là xoá sổ công kiểm kê.
        await db
          .update(schema.inventoryItems)
          .set({
            unit: ing.unit,
            min_stock: String(ing.min ?? 0),
            pack_size: String(packSize),
            pack_label: packLabel,
            category_id: catIdByName[cat.name],
            is_active: true,
            internal_code: existing.internal_code ?? (await nextInternalCode(branchId)),
          })
          .where(eq(schema.inventoryItems.id, existing.id));
        updated++;
        continue;
      }

      await db.insert(schema.inventoryItems).values({
        branch_id: branchId,
        organization_id: orgId,
        category_id: catIdByName[cat.name],
        name: ing.name,
        unit: ing.unit,
        current_stock: "0",
        min_stock: String(ing.min ?? 0),
        cost_per_unit: 0,
        pack_size: String(packSize),
        pack_label: packLabel,
        internal_code: await nextInternalCode(branchId),
      });
      created++;
    }
  }
  console.log(`  ✓ Nguyên liệu: tạo mới ${created}, cập nhật ${updated}.`);

  // 4) Nhóm mẫu rỗng thì dọn luôn cho gọn.
  for (const name of DEMO_CATEGORIES) {
    const [cat] = await db
      .select({ id: schema.inventoryCategories.id })
      .from(schema.inventoryCategories)
      .where(
        and(
          eq(schema.inventoryCategories.branch_id, branchId),
          eq(schema.inventoryCategories.name, name),
        ),
      )
      .limit(1);
    if (!cat) continue;

    const still = await db
      .select({ id: schema.inventoryItems.id })
      .from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.category_id, cat.id))
      .limit(1);
    if (still.length > 0) continue;

    await db.delete(schema.inventoryCategories).where(eq(schema.inventoryCategories.id, cat.id));
    console.log(`  ✓ Xoá nhóm mẫu rỗng "${name}".`);
  }
}

async function main() {
  console.log("📦 Dựng danh mục nguyên liệu Toda...");
  const branches = await db
    .select({
      id: schema.branches.id,
      organization_id: schema.branches.organization_id,
      name: schema.branches.name,
    })
    .from(schema.branches);

  for (const b of branches) {
    console.log(`\n== Chi nhánh: ${b.name} ==`);
    await setupForBranch(b.organization_id, b.id);
  }
  console.log("\n🎉 Hoàn tất.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
