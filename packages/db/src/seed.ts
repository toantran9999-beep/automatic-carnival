import { db, schema } from "./index";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";

function vnd(amount: number) {
  return amount * 100;
}

async function seed() {
  console.log("🌱 Cleaning up database...");

  // Truncate all tables to start with a completely clean slate
  await db.execute(sql`
    TRUNCATE TABLE 
      coupon_assignments, 
      coupon_redemptions, 
      coupons, 
      customer_loyalty, 
      customers, 
      inventory_categories, 
      inventory_items, 
      inventory_movements, 
      invoices, 
      loyalty_programs, 
      loyalty_tiers, 
      loyalty_transactions, 
      menu_categories, 
      menu_item_modifier_groups, 
      menu_items, 
      modifier_groups, 
      modifiers, 
      order_item_modifiers, 
      order_items, 
      orders, 
      payments, 
      recipe_ingredients, 
      refresh_tokens, 
      reward_redemptions, 
      rewards, 
      shifts, 
      spaces, 
      table_assignments, 
      table_sessions, 
      tables,
      user_branches,
      users,
      branches,
      organizations
    CASCADE;
  `);

  console.log("🌱 Seeding clean database with TODA POS core accounts...");

  // 1. Create organization
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "TODA POS",
      slug: "toda",
      plan: "pro",
      settings: { theme: "default" },
    })
    .returning();

  console.log(`✅ Organization: ${org.name} (${org.id})`);

  // 2. Create branch
  const [branch] = await db
    .insert(schema.branches)
    .values({
      organization_id: org.id,
      name: "Chi Nhánh Chính",
      slug: "chi-nhanh-chinh",
      address: "123 Đường Ba Tháng Hai, Quận 10, TP. Hồ Chí Minh",
      phone: "+84 28 1234 5678",
      timezone: "Asia/Ho_Chi_Minh",
      currency: "VND",
      tax_rate: 1000, // 10% VAT
      settings: {},
    })
    .returning();

  console.log(`✅ Branch: ${branch.name} (${branch.id})`);

  // 3. Create admin user
  const passwordHash = await hash("admin12345");

  const [admin] = await db
    .insert(schema.users)
    .values({
      organization_id: org.id,
      email: "admin@toda.local",
      password_hash: passwordHash,
      name: "Quản Trị Viên",
      role: "org_admin",
    })
    .returning();

  // Link admin to branch
  await db.insert(schema.userBranches).values({
    user_id: admin.id,
    branch_id: branch.id,
  });

  console.log(`✅ Admin: ${admin.email} (password: admin12345)`);

  // 4. Create staff users
  const staffData = [
    { email: "quanly@toda.local", name: "Quản Lý Cửa Hàng", role: "branch_manager" as const, password: "quanly123" },
    { email: "thungan@toda.local", name: "Thu Ngân", role: "cashier" as const, password: "thungan123" },
    { email: "phucvu@toda.local", name: "Nhân Viên Phục Vụ", role: "waiter" as const, password: "phucvu123" },
    { email: "bep@toda.local", name: "Nhân Viên Bếp", role: "kitchen" as const, password: "bep12345" },
  ];

  for (const s of staffData) {
    const ph = await hash(s.password);
    const [user] = await db
      .insert(schema.users)
      .values({
        organization_id: org.id,
        email: s.email,
        password_hash: ph,
        name: s.name,
        role: s.role,
      })
      .returning();

    await db.insert(schema.userBranches).values({
      user_id: user.id,
      branch_id: branch.id,
    });

    console.log(`✅ Staff: ${s.email} (${s.role}, password: ${s.password})`);
  }

  // 5. Create spaces and tables for POS dine-in flow
  const spaceData = [
    { name: "Tầng trệt", description: "Khu vực chính", floor_number: 1, sort_order: 1 },
    { name: "Lầu 1", description: "Khu vực gia đình", floor_number: 2, sort_order: 2 },
    { name: "Ngoài trời", description: "Khu vực thoáng", floor_number: 1, sort_order: 3 },
  ];

  const createdSpaces = [];
  for (const space of spaceData) {
    const [created] = await db
      .insert(schema.spaces)
      .values({
        branch_id: branch.id,
        organization_id: org.id,
        ...space,
      })
      .returning();
    createdSpaces.push(created);
  }

  for (let i = 1; i <= 15; i++) {
    const space = i <= 6 ? createdSpaces[0] : i <= 12 ? createdSpaces[1] : createdSpaces[2];
    await db.insert(schema.tables).values({
      branch_id: branch.id,
      organization_id: org.id,
      space_id: space.id,
      number: i,
      capacity: i <= 4 ? 2 : i <= 12 ? 4 : 6,
      qr_code: `toda-${branch.slug}-ban-${i}`,
      status: "available",
      position_x: ((i - 1) % 5) * 140,
      position_y: Math.floor((i - 1) / 5) * 110,
    });
  }

  console.log(`✅ ${createdSpaces.length} khu vực và 15 bàn đã tạo`);

  // 6. Create menu categories and items
  const categories = [
    { name: "Món chính", description: "Các món bán chạy", sort_order: 1 },
    { name: "Món ăn nhẹ", description: "Khai vị và ăn kèm", sort_order: 2 },
    { name: "Đồ uống", description: "Trà, nước ép và đồ uống lạnh", sort_order: 3 },
    { name: "Combo", description: "Combo nhanh cho POS", sort_order: 4 },
  ];

  const createdCategories = [];
  for (const cat of categories) {
    const [created] = await db
      .insert(schema.menuCategories)
      .values({
        branch_id: branch.id,
        organization_id: org.id,
        ...cat,
      })
      .returning();
    createdCategories.push(created);
  }

  const menuItems = [
    {
      categoryIdx: 0,
      name: "Cơm gà xối mỡ",
      price: vnd(45000),
      prep: 12,
      desc: "Cơm gà giòn, dưa leo, nước mắm gừng",
    },
    {
      categoryIdx: 0,
      name: "Bún bò Huế",
      price: vnd(55000),
      prep: 10,
      desc: "Bún bò cay nhẹ, giò heo, chả cua",
    },
    {
      categoryIdx: 0,
      name: "Phở bò tái",
      price: vnd(52000),
      prep: 8,
      desc: "Nước dùng bò, bánh phở, rau thơm",
    },
    {
      categoryIdx: 0,
      name: "Mì xào hải sản",
      price: vnd(69000),
      prep: 14,
      desc: "Mì trứng xào tôm, mực, rau củ",
    },
    {
      categoryIdx: 1,
      name: "Chả giò hải sản",
      price: vnd(39000),
      prep: 9,
      desc: "4 cuốn, ăn kèm rau sống",
    },
    {
      categoryIdx: 1,
      name: "Khoai tây chiên",
      price: vnd(32000),
      prep: 6,
      desc: "Khoai giòn, sốt tương cà",
    },
    {
      categoryIdx: 1,
      name: "Gỏi cuốn tôm thịt",
      price: vnd(42000),
      prep: 7,
      desc: "3 cuốn, nước chấm đậu phộng",
    },
    {
      categoryIdx: 2,
      name: "Trà tắc",
      price: vnd(18000),
      prep: 2,
      desc: "Trà tắc mát lạnh",
      imageUrl: "/images/products/tra-tac.png",
    },
    {
      categoryIdx: 2,
      name: "Trà chanh",
      price: vnd(18000),
      prep: 2,
      desc: "Trà chanh ít ngọt",
      imageUrl: "/images/products/tra-chanh.png",
    },
    {
      categoryIdx: 2,
      name: "Matcha đá xay",
      price: vnd(39000),
      prep: 4,
      desc: "Matcha đá xay kem sữa",
      imageUrl: "/images/products/matcha-da-xay.png",
    },
    {
      categoryIdx: 3,
      name: "Combo cơm gà + trà tắc",
      price: vnd(59000),
      prep: 12,
      desc: "Một cơm gà xối mỡ và một trà tắc",
    },
    {
      categoryIdx: 3,
      name: "Combo phở + trà chanh",
      price: vnd(65000),
      prep: 10,
      desc: "Một phở bò tái và một trà chanh",
    },
  ];

  const createdMenuItems = [];
  for (const [index, item] of menuItems.entries()) {
    const [created] = await db
      .insert(schema.menuItems)
      .values({
        category_id: createdCategories[item.categoryIdx].id,
        branch_id: branch.id,
        organization_id: org.id,
        name: item.name,
        description: item.desc,
        price: item.price,
        image_url: item.imageUrl || null,
        preparation_time_min: item.prep,
        sort_order: index + 1,
      })
      .returning();
    createdMenuItems.push(created);
  }

  console.log(`✅ ${createdCategories.length} danh mục và ${createdMenuItems.length} món đã tạo`);

  // 7. Create simple modifier groups for common POS options
  const [sugarGroup] = await db
    .insert(schema.modifierGroups)
    .values({
      branch_id: branch.id,
      organization_id: org.id,
      name: "Mức đường",
      min_selections: 0,
      max_selections: 1,
      is_required: false,
    })
    .returning();

  await db.insert(schema.modifiers).values([
    { group_id: sugarGroup.id, name: "Không đường", price: 0 },
    { group_id: sugarGroup.id, name: "Ít đường", price: 0 },
    { group_id: sugarGroup.id, name: "Nhiều đường", price: 0 },
  ]);

  const drinkItems = createdMenuItems.filter((item) =>
    ["Trà tắc", "Trà chanh", "Matcha đá xay"].includes(item.name),
  );
  for (const item of drinkItems) {
    await db.insert(schema.menuItemModifierGroups).values({
      item_id: item.id,
      group_id: sugarGroup.id,
    });
  }

  // 8. Create inventory sample data
  const [invCat] = await db
    .insert(schema.inventoryCategories)
    .values({
      branch_id: branch.id,
      organization_id: org.id,
      name: "Nguyên liệu chính",
    })
    .returning();

  await db.insert(schema.inventoryItems).values([
    {
      branch_id: branch.id,
      organization_id: org.id,
      category_id: invCat.id,
      name: "Gạo",
      unit: "kg",
      current_stock: "50.000",
      min_stock: "10.000",
      cost_per_unit: vnd(18000),
    },
    {
      branch_id: branch.id,
      organization_id: org.id,
      category_id: invCat.id,
      name: "Thịt gà",
      unit: "kg",
      current_stock: "25.000",
      min_stock: "5.000",
      cost_per_unit: vnd(65000),
    },
    {
      branch_id: branch.id,
      organization_id: org.id,
      category_id: invCat.id,
      name: "Bánh phở",
      unit: "kg",
      current_stock: "20.000",
      min_stock: "5.000",
      cost_per_unit: vnd(22000),
    },
    {
      branch_id: branch.id,
      organization_id: org.id,
      category_id: invCat.id,
      name: "Trà",
      unit: "kg",
      current_stock: "5.000",
      min_stock: "1.000",
      cost_per_unit: vnd(120000),
    },
  ]);

  console.log("✅ Dữ liệu kho mẫu đã tạo");

  console.log("\n🎉 Seed TODA POS hoàn tất!");
  console.log("\n📋 Tài khoản đăng nhập:");
  console.log("   Admin:    admin@toda.local / admin12345");
  console.log("   Quản lý:  quanly@toda.local / quanly123");
  console.log("   Thu ngân: thungan@toda.local / thungan123");
  console.log("   Phục vụ:  phucvu@toda.local / phucvu123");
  console.log("   Bếp:      bep@toda.local / bep12345");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
