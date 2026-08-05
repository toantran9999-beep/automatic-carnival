import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { generateOrderNumber } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { awardPoints } from "./loyalty.service.js";
import { deductForOrder } from "./inventory.service.js";

// Types for order creation input
interface OrderItemInput {
  /** Không có = món nhập tay (ngoài menu), dùng customName + customPrice. */
  menuItemId?: string;
  customName?: string;
  customPrice?: number;
  quantity: number;
  notes?: string;
  modifiers?: Array<{ modifierId: string }>;
}

interface CreateOrderParams {
  organizationId: string;
  branchId: string;
  items: OrderItemInput[];
  type: string;
  customerName?: string | null;
  notes?: string | null;
  tableSessionId?: string | null;
  customerId?: string | null;
  couponCode?: string | null;
  redemptionId?: string | null;
  lang?: "vi" | "en";
  /** Ca đang mở. Có thì đơn được cấp số thứ tự theo ca (01, 02…); không có thì rơi về mã dài. */
  registerShiftId?: string | null;
  /**
   * Nhân viên bấm đơn (`users.id`). Null khi khách tự gọi qua QR.
   * ⚠️ Đừng bỏ trống cho tiện: đây là thứ DUY NHẤT cho biết ai order, không suy ra
   * được từ chỗ nào khác (ca làm chỉ có một tên cho cả buổi).
   */
  createdBy?: string | null;
}

interface CreateOrderResult {
  order: typeof schema.orders.$inferSelect;
  items: (typeof schema.orderItems.$inferSelect)[];
}

interface ResolvedOrderItem {
  menu_item_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  total: number;
  notes?: string;
  unit?: string | null;
  modifiers: Array<{ modifierId: string }>;
}

interface ResolvedItems {
  subtotal: number;
  orderItemsData: ResolvedOrderItem[];
  modifierMap: Map<string, { id: string; name: string; price: number }>;
}

/**
 * Tra thực đơn và tính tiền cho một danh sách món: chặn món ngừng bán, cộng giá
 * tùy chọn, xử lý món nhập tay ngoài menu.
 *
 * ⚠️ Dùng CHUNG cho cả tạo đơn mới lẫn thêm món vào đơn có sẵn. Đừng chép đôi khối
 * này — giá bán hai đường mà lệch nhau thì rất khó phát hiện, tới lúc đối soát mới lòi.
 *
 * ⚠️ PHẢI truyền `organizationId` + `branchId`: giá bán lấy từ DB theo id máy khách
 * gửi lên, nên thiếu hai khóa này là ai cũng đặt được món/tùy chọn của CHI NHÁNH KHÁC
 * và mua theo giá bên đó. Xem khối kiểm tra bên dưới.
 */
async function resolveOrderItems(
  items: OrderItemInput[],
  scope: { organizationId: string; branchId: string },
): Promise<ResolvedItems> {
  // Get menu items for price calculation (bỏ qua món nhập tay không có menuItemId)
  const menuItemIds = items
    .map((i) => i.menuItemId)
    .filter((id): id is string => !!id);
  const menuItemsResult = menuItemIds.length
    ? await db
        .select()
        .from(schema.menuItems)
        .where(
          and(
            inArray(schema.menuItems.id, menuItemIds),
            // Khóa theo chi nhánh đang bán: id món của quán/chi nhánh khác coi như
            // không tồn tại, chứ không âm thầm bán theo giá bên đó.
            eq(schema.menuItems.branch_id, scope.branchId),
            eq(schema.menuItems.organization_id, scope.organizationId),
          ),
        )
    : [];

  const menuItemMap = new Map(menuItemsResult.map((mi) => [mi.id, mi]));

  // Collect all modifier IDs and fetch their prices
  const allModifierIds = items.flatMap(
    (i) => i.modifiers?.map((m) => m.modifierId) || [],
  );

  let modifierMap = new Map<
    string,
    { id: string; name: string; price: number }
  >();
  /** modifierId -> các món được phép dùng tùy chọn đó (theo thực đơn đã cấu hình). */
  const allowedItemsByModifier = new Map<string, Set<string>>();
  if (allModifierIds.length > 0) {
    // ⚠️ KHÔNG lấy tùy chọn theo id trần. Phải đi qua nhóm tùy chọn đã gắn vào món
    // (menu_item_modifier_groups) và nhóm phải thuộc đúng chi nhánh đang bán.
    // Thiếu chốt này thì máy khách gắn tùy chọn giảm giá của MÓN KHÁC (hoặc chi
    // nhánh khác) vào bất kỳ món nào — giá bán tụt mà sổ sách trông vẫn bình thường.
    const modifierRecords = await db
      .select({
        id: schema.modifiers.id,
        name: schema.modifiers.name,
        price: schema.modifiers.price,
        item_id: schema.menuItemModifierGroups.item_id,
      })
      .from(schema.modifiers)
      .innerJoin(
        schema.modifierGroups,
        eq(schema.modifierGroups.id, schema.modifiers.group_id),
      )
      .innerJoin(
        schema.menuItemModifierGroups,
        eq(schema.menuItemModifierGroups.group_id, schema.modifierGroups.id),
      )
      .where(
        and(
          inArray(schema.modifiers.id, allModifierIds),
          eq(schema.modifiers.is_available, true),
          eq(schema.modifierGroups.branch_id, scope.branchId),
          eq(schema.modifierGroups.organization_id, scope.organizationId),
        ),
      );
    for (const m of modifierRecords) {
      modifierMap.set(m.id, { id: m.id, name: m.name, price: m.price });
      const allowed = allowedItemsByModifier.get(m.id) ?? new Set<string>();
      allowed.add(m.item_id);
      allowedItemsByModifier.set(m.id, allowed);
    }
  }

  // Validate items and calculate totals
  let subtotal = 0;
  const orderItemsData: ResolvedOrderItem[] = [];

  for (const item of items) {
    // Món nhập tay: không tra menu, lấy thẳng tên + giá nhân viên nhập.
    if (!item.menuItemId) {
      if (!item.customName || item.customPrice === undefined || item.customPrice < 0) {
        throw new OrderValidationError("Món nhập tay thiếu tên hoặc giá");
      }
      const itemTotal = item.customPrice * item.quantity;
      subtotal += itemTotal;
      orderItemsData.push({
        menu_item_id: null,
        name: item.customName,
        unit_price: item.customPrice,
        quantity: item.quantity,
        total: itemTotal,
        notes: item.notes,
        unit: null,
        modifiers: [],
      });
      continue;
    }

    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem) {
      throw new OrderValidationError(`Item no encontrado: ${item.menuItemId}`);
    }
    if (!menuItem.is_available) {
      throw new OrderValidationError(`Item no disponible: ${menuItem.name}`);
    }

    let modifierPricePerUnit = 0;
    if (item.modifiers?.length) {
      for (const mod of item.modifiers) {
        const modifier = modifierMap.get(mod.modifierId);
        // ⚠️ Trước đây `if (modifier)` — tùy chọn không tra được thì ÂM THẦM bỏ qua,
        // nghĩa là giá bán đổi mà không ai biết. Nay không tra được (đã ngừng bán,
        // sai chi nhánh, hoặc không thuộc thực đơn) thì chặn hẳn đơn.
        if (!modifier || !allowedItemsByModifier.get(mod.modifierId)?.has(menuItem.id)) {
          throw new OrderValidationError(
            `Tùy chọn không hợp lệ cho món "${menuItem.name}"`,
          );
        }
        modifierPricePerUnit += modifier.price;
      }
    }

    const itemTotal = (menuItem.price + modifierPricePerUnit) * item.quantity;

    // Chốt chặn cuối: tùy chọn giảm giá là CỐ Ý (VD "Nhẹ" -2.000đ), nhưng cộng dồn
    // tới mức dòng món ra số âm thì chắc chắn là gói tin bịa, không phải cách bán.
    if (itemTotal < 0) {
      throw new OrderValidationError(
        `Tùy chọn làm món "${menuItem.name}" thành giá âm`,
      );
    }

    subtotal += itemTotal;

    orderItemsData.push({
      menu_item_id: menuItem.id,
      name: menuItem.name,
      unit_price: menuItem.price,
      quantity: item.quantity,
      total: itemTotal,
      notes: item.notes,
      unit: (menuItem as any).unit ?? null,
      modifiers: item.modifiers || [],
    });
  }

  return { subtotal, orderItemsData, modifierMap };
}

/** Thuế suất của chi nhánh (điểm cơ bản; 1000 = 10%). VAT tính GỘP trong giá bán. */
async function getBranchTaxRate(branchId: string): Promise<number> {
  const [branch] = await db
    .select({ tax_rate: schema.branches.tax_rate })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);
  return branch?.tax_rate ?? 1000;
}

export interface ItemModifierSnapshot {
  modifierId: string | null;
  name: string;
  /** Phụ trội MỖI ĐƠN VỊ, tính bằng xu. Âm = giảm giá (VD "Nhẹ" = -200000). */
  price: number;
}

/**
 * Lấy tùy chọn (topping/size/liều) của một loạt dòng món, gom sẵn theo
 * `order_item_id` để gắn vào kết quả.
 *
 * ⚠️ Đọc tên + giá từ SNAPSHOT trong `order_item_modifiers`, KHÔNG join sang bảng
 * `modifiers` hiện tại. Join sang bảng gốc thì sửa giá tùy chọn trong thực đơn là
 * phiếu cũ đổi giá theo, còn xóa tùy chọn khỏi thực đơn (`modifier_id` → NULL) là
 * `innerJoin` rớt hẳn dòng — hóa đơn mất luôn phần giải thích chênh lệch giá.
 *
 * ⚠️ Mọi chỗ đọc dòng món ra để IN đều phải gọi hàm này. Thiếu tùy chọn thì phiếu
 * in ra `unit_price` (giá gốc, chưa gồm tùy chọn) mà tổng lại lấy từ đơn, thành ra
 * hai con số vênh nhau trên cùng tờ giấy.
 */
export async function loadItemModifiers(
  itemIds: string[],
): Promise<Map<string, ItemModifierSnapshot[]>> {
  const map = new Map<string, ItemModifierSnapshot[]>();
  if (itemIds.length === 0) return map;

  const rows = await db
    .select({
      order_item_id: schema.orderItemModifiers.order_item_id,
      modifier_id: schema.orderItemModifiers.modifier_id,
      name: schema.orderItemModifiers.name,
      price: schema.orderItemModifiers.price,
    })
    .from(schema.orderItemModifiers)
    .where(inArray(schema.orderItemModifiers.order_item_id, itemIds));

  for (const r of rows) {
    if (!map.has(r.order_item_id)) map.set(r.order_item_id, []);
    map.get(r.order_item_id)!.push({
      modifierId: r.modifier_id,
      name: r.name,
      price: r.price,
    });
  }
  return map;
}

/**
 * Validates menu items and creates an order with its items.
 * Returns the created order and items, or throws an error if validation fails.
 */
export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const {
    organizationId,
    branchId,
    items,
    type,
    customerName,
    notes,
    tableSessionId,
    customerId,
    couponCode,
    redemptionId,
    lang,
    registerShiftId,
    createdBy,
  } = params;

  const { subtotal, orderItemsData, modifierMap } = await resolveOrderItems(items, {
    organizationId,
    branchId,
  });
  const taxRate = await getBranchTaxRate(branchId);

  // Create order + items + coupon redemption in a transaction
  // Coupon validation is INSIDE the transaction to prevent race conditions on current_uses
  return await db.transaction(async (tx) => {
    // Số thứ tự theo ca: 01, 02… Mở ca mới là bản ghi ca mới nên tự về 01.
    //
    // ⚠️ PHẢI dùng `UPDATE … RETURNING`, TUYỆT ĐỐI không `SELECT max()+1`: quán bán
    // bằng nhiều máy cùng lúc (máy POS quầy + điện thoại order), đọc rồi mới ghi thì
    // hai đơn bấm cùng lúc sẽ nhận CÙNG một số. Lệnh này khoá dòng ca nên mỗi lượt
    // gọi chắc chắn nhận một số khác nhau.
    //
    // Nằm trong transaction nên đơn hỏng giữa chừng (mã giảm giá không hợp lệ…) thì
    // bộ đếm quay lui theo, không để lại lỗ số.
    let orderNumber = generateOrderNumber();
    let shiftSeq: number | null = null;
    if (registerShiftId) {
      const [bumped] = await tx
        .update(schema.registerShifts)
        .set({
          order_seq: sql`${schema.registerShifts.order_seq} + 1`,
          updated_at: new Date(),
        })
        .where(eq(schema.registerShifts.id, registerShiftId))
        .returning({ seq: schema.registerShifts.order_seq });

      if (bumped) {
        shiftSeq = bumped.seq;
        orderNumber = String(bumped.seq).padStart(2, "0");
      }
    }

    // Calculate coupon discount inside tx
    let discount = 0;
    let couponId: string | null = null;

    if (couponCode) {
      const couponResult = await applyCoupon({
        couponCode,
        organizationId,
        orderItems: orderItemsData,
        subtotal,
        customerId: customerId || null,
        lang,
      }, tx);
      discount = couponResult.discount;
      couponId = couponResult.couponId;
    }
    /** Riêng phần của MÃ GIẢM GIÁ — dòng coupon_redemptions phải ghi đúng số này. */
    const couponDiscount = discount;

    // Apply reward redemption discount (stacks with coupon)
    let redemptionDiscount = 0;
    if (redemptionId) {
      const rd = await applyRedemption({ redemptionId, customerId: customerId || null, subtotal, couponDiscount: discount }, tx);
      redemptionDiscount = rd.discount;
    }

    discount += redemptionDiscount;

    // VAT is inclusive. Subtotal is the sum of tax-inclusive item prices.
    const total = subtotal - discount;
    const tax = Math.round(total - (total / (1 + (taxRate / 10000))));

    const [order] = await tx
      .insert(schema.orders)
      .values({
        organization_id: organizationId,
        branch_id: branchId,
        table_session_id: tableSessionId || null,
        customer_id: customerId || null,
        order_number: orderNumber,
        register_shift_id: registerShiftId || null,
        shift_seq: shiftSeq,
        type: type as any,
        status: "pending",
        customer_name: customerName || null,
        subtotal,
        tax,
        discount,
        total,
        notes: notes || null,
        created_by: createdBy ?? null,
      })
      .returning();

    // Ghi người bấm lên TỪNG món, không chỉ trên đơn: khách gọi thêm giữa buổi thì
    // người thêm món khác người mở đơn, mà đó đúng là ca cần truy nhất.
    const createdItems = await tx
      .insert(schema.orderItems)
      .values(
        orderItemsData.map(({ modifiers: _mods, ...item }) => ({
          order_id: order.id,
          ...item,
          created_by: createdBy ?? null,
        })),
      )
      .returning();

    // Insert order item modifiers
    for (let i = 0; i < createdItems.length; i++) {
      const itemData = orderItemsData[i];
      if (itemData.modifiers.length > 0) {
        await tx.insert(schema.orderItemModifiers).values(
          itemData.modifiers.map((mod) => {
            const modifier = modifierMap.get(mod.modifierId);
            return {
              order_item_id: createdItems[i].id,
              modifier_id: mod.modifierId,
              name: modifier?.name || "Tùy chọn",
              price: modifier?.price || 0,
            };
          }),
        );
      }
    }

    // Link reward redemption to order
    if (redemptionId && redemptionDiscount > 0) {
      await tx
        .update(schema.rewardRedemptions)
        .set({ order_id: order.id })
        .where(eq(schema.rewardRedemptions.id, redemptionId));
    }

    // Record coupon redemption
    if (couponId) {
      await tx.insert(schema.couponRedemptions).values({
        coupon_id: couponId,
        customer_id: customerId || null,
        order_id: order.id,
        // ⚠️ `couponDiscount` chứ KHÔNG phải `discount`: `discount` lúc này đã cộng
        // thêm phần đổi điểm thưởng. Ghi cả cụm vào đây là báo cáo hiệu quả mã giảm
        // giá thổi phồng lên, và phần khuyến mãi bị đếm hai lần khi đối soát.
        discount_applied: couponDiscount,
      });
      // Increment current_uses
      await tx
        .update(schema.coupons)
        .set({ current_uses: sql`${schema.coupons.current_uses} + 1` })
        .where(eq(schema.coupons.id, couponId));

      // Update couponAssignment used_at if customer is known
      if (customerId) {
        await tx
          .update(schema.couponAssignments)
          .set({ used_at: new Date() })
          .where(
            and(
              eq(schema.couponAssignments.coupon_id, couponId),
              eq(schema.couponAssignments.customer_id, customerId),
            ),
          );
      }
    }

    return { order, items: createdItems };
  });
}

// ---------------------------------------------------------------------------
// Thêm món vào đơn đang mở
// ---------------------------------------------------------------------------

interface AddItemsParams {
  orderId: string;
  branchId: string;
  items: OrderItemInput[];
  /** Nhân viên thêm món — thường KHÁC người mở đơn, đó chính là lý do phải ghi. */
  createdBy?: string | null;
}

/**
 * Thêm món vào một đơn ĐANG MỞ (khách mua thêm).
 *
 * Vì sao cần: đơn tại bàn gom nhiều đơn vào một PHIÊN BÀN nên gọi thêm chỉ là tạo
 * thêm đơn trong phiên. Đơn mang về không có phiên — mỗi đơn đứng một mình, không
 * có chỗ gắn món mới, nên phải cộng thẳng vào đơn cũ.
 *
 * Giữ nguyên `order_number` / `register_shift_id` / `shift_seq`: vẫn là MỘT đơn,
 * MỘT số phiếu — khách cầm một số, quầy đối soát một dòng.
 */
export async function addItemsToOrder(
  params: AddItemsParams,
): Promise<{ order: typeof schema.orders.$inferSelect; addedItems: (typeof schema.orderItems.$inferSelect)[] }> {
  const { orderId, branchId, items, createdBy } = params;

  const [order] = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.branch_id, branchId)))
    .limit(1);

  if (!order) throw new OrderValidationError("Không tìm thấy đơn hàng ở chi nhánh này");
  if (order.status === "cancelled") throw new OrderValidationError("Đơn đã hủy, không thêm món được");
  if (order.status === "completed") throw new OrderValidationError("Đơn đã hoàn tất, vui lòng tạo đơn mới");

  // Đã thu đủ tiền = đơn đã đóng sổ. Cộng thêm món vào đó là tạo ra khoản nợ vô
  // hình: phiếu đã in, tiền đã ghi nhận, mà tổng đơn lại nhảy lên.
  const [paid] = await db
    .select({ total: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)::int` })
    .from(schema.payments)
    .where(
      and(eq(schema.payments.order_id, orderId), eq(schema.payments.status, "completed")),
    );
  if ((paid?.total ?? 0) >= order.total) {
    throw new OrderValidationError("Đơn đã thanh toán xong, vui lòng tạo đơn mới");
  }

  // Lấy tổ chức từ chính đơn đang mở — cùng chi nhánh, cùng thực đơn với lúc mở đơn.
  const { subtotal: addedSubtotal, orderItemsData, modifierMap } =
    await resolveOrderItems(items, {
      organizationId: order.organization_id,
      branchId,
    });
  const taxRate = await getBranchTaxRate(branchId);

  return await db.transaction(async (tx) => {
    // ⚠️ KHÔNG lấy `order.created_by`: món thêm phải ghi người BẤM LẦN NÀY, đó mới là
    // thông tin mới. Ghi lại người mở đơn thì cột này thành vô nghĩa.
    const addedItems = await tx
      .insert(schema.orderItems)
      .values(
        orderItemsData.map(({ modifiers: _mods, ...item }) => ({
          order_id: orderId,
          ...item,
          created_by: createdBy ?? null,
        })),
      )
      .returning();

    for (let i = 0; i < addedItems.length; i++) {
      const itemData = orderItemsData[i];
      if (itemData.modifiers.length > 0) {
        await tx.insert(schema.orderItemModifiers).values(
          itemData.modifiers.map((mod) => {
            const modifier = modifierMap.get(mod.modifierId);
            return {
              order_item_id: addedItems[i].id,
              modifier_id: mod.modifierId,
              name: modifier?.name || "Tùy chọn",
              price: modifier?.price || 0,
            };
          }),
        );
      }
    }

    // VAT tính GỘP: tính lại từ tổng mới chứ không cộng dồn phần thuế của lô thêm,
    // để tránh lệch một vài đồng do làm tròn nhiều lần.
    const newSubtotal = order.subtotal + addedSubtotal;
    const newTotal = newSubtotal - order.discount;
    const newTax = Math.round(newTotal - newTotal / (1 + taxRate / 10000));

    const [updated] = await tx
      .update(schema.orders)
      .set({
        subtotal: newSubtotal,
        total: newTotal,
        tax: newTax,
        updated_at: new Date(),
      })
      .where(eq(schema.orders.id, orderId))
      .returning();

    return { order: updated, addedItems };
  });
}

// ---------------------------------------------------------------------------
// Coupon discount calculation
// ---------------------------------------------------------------------------

interface ApplyCouponParams {
  couponCode: string;
  organizationId: string;
  orderItems: Array<{ menu_item_id: string | null; unit_price: number; quantity: number; total: number }>;
  subtotal: number;
  customerId: string | null;
  lang?: "vi" | "en";
}

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyCoupon(params: ApplyCouponParams, tx: TxOrDb): Promise<{ discount: number; couponId: string }> {
  const { couponCode, organizationId, orderItems, subtotal, customerId, lang = "vi" } = params;

  const [coupon] = await tx
    .select()
    .from(schema.coupons)
    .where(
      and(
        eq(schema.coupons.organization_id, organizationId),
        eq(schema.coupons.code, couponCode.toUpperCase()),
        eq(schema.coupons.status, "active"),
      ),
    )
    .limit(1);

  if (!coupon) {
    throw new OrderValidationError(
      lang === "vi" ? "Mã giảm giá không tồn tại hoặc đã ngừng hoạt động" : "Coupon not found or inactive"
    );
  }

  // Validate usage limits
  if (coupon.max_uses_total && coupon.current_uses >= coupon.max_uses_total) {
    throw new OrderValidationError(
      lang === "vi" ? "Mã giảm giá đã đạt giới hạn sử dụng" : "Coupon has reached its usage limit"
    );
  }

  // Validate per-customer usage limit
  if (coupon.max_uses_per_customer && customerId) {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.couponRedemptions)
      .where(
        and(
          eq(schema.couponRedemptions.coupon_id, coupon.id),
          eq(schema.couponRedemptions.customer_id, customerId),
        ),
      );
    if (count >= coupon.max_uses_per_customer) {
      throw new OrderValidationError(
        lang === "vi"
          ? "Bạn đã sử dụng mã giảm giá này đạt số lần tối đa cho phép"
          : "You have already used this coupon the maximum number of times"
      );
    }
  }

  // Validate date range
  const now = new Date();
  if (coupon.starts_at && now < coupon.starts_at) {
    throw new OrderValidationError(
      lang === "vi" ? "Mã giảm giá chưa đến thời gian áp dụng" : "Coupon is not yet active"
    );
  }
  if (coupon.expires_at && now > coupon.expires_at) {
    throw new OrderValidationError(
      lang === "vi" ? "Mã giảm giá đã hết hạn" : "Coupon has expired"
    );
  }

  // Validate min order amount
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    const formattedMin = new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US", {
      style: "currency",
      currency: "VND",
      minimumFractionDigits: 0,
    }).format(coupon.min_order_amount / 100);

    throw new OrderValidationError(
      lang === "vi"
        ? `Đơn hàng tối thiểu để áp dụng mã giảm giá này là ${formattedMin}`
        : `Minimum order amount for this coupon is ${formattedMin}`
    );
  }

  let discount = 0;

  switch (coupon.type) {
    case "percentage": {
      discount = Math.round(subtotal * ((coupon.discount_value || 0) / 100));
      break;
    }
    case "fixed": {
      discount = Math.min(coupon.discount_value || 0, subtotal);
      break;
    }
    case "item_free": {
      // Make one unit of a qualifying item free
      if (coupon.menu_item_id) {
        // Specific item must be free
        const match = orderItems.find((i) => i.menu_item_id === coupon.menu_item_id);
        if (match) {
          discount = match.unit_price; // 1 unit free
        }
      } else {
        // No specific item — cheapest item is free
        const cheapest = orderItems.reduce(
          (min, i) => (i.unit_price < min.unit_price ? i : min),
          orderItems[0],
        );
        if (cheapest) {
          discount = cheapest.unit_price;
        }
      }
      break;
    }
    case "item_discount": {
      // Discount on a specific item
      if (coupon.menu_item_id) {
        const match = orderItems.find((i) => i.menu_item_id === coupon.menu_item_id);
        if (match) {
          discount = Math.round(match.total * ((coupon.discount_value || 0) / 100));
        }
      }
      break;
    }
    case "category_discount": {
      // Discount on items in a category — need to check category
      if (coupon.category_id) {
        const categoryItemIds = await tx
          .select({ id: schema.menuItems.id })
          .from(schema.menuItems)
          .where(eq(schema.menuItems.category_id, coupon.category_id));
        const catIds = new Set(categoryItemIds.map((c) => c.id));
        const matchingTotal = orderItems
          .filter((i) => i.menu_item_id !== null && catIds.has(i.menu_item_id))
          .reduce((sum, i) => sum + i.total, 0);
        discount = Math.round(matchingTotal * ((coupon.discount_value || 0) / 100));
      }
      break;
    }
    case "buy_x_get_y": {
      // Buy X items, get Y free (cheapest ones)
      const totalQty = orderItems.reduce((sum, i) => sum + i.quantity, 0);
      const buyQty = coupon.buy_quantity || 0;
      const getQty = coupon.get_quantity || 0;
      if (totalQty >= buyQty + getQty) {
        // Sort items by unit price ascending, make the cheapest getQty items free
        const expanded = orderItems.flatMap((i) =>
          Array.from({ length: i.quantity }, () => i.unit_price),
        );
        expanded.sort((a, b) => a - b);
        discount = expanded.slice(0, getQty).reduce((sum, p) => sum + p, 0);
      }
      break;
    }
  }

  // Apply max discount cap
  if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
    discount = coupon.max_discount_amount;
  }

  // Kẹp cả HAI đầu: không quá tiền hàng, và không âm.
  //
  // ⚠️ Thiếu `Math.max(0, …)` là giảm giá âm chạy ngược — `total = subtotal − discount`
  // nên discount âm làm đơn TĂNG tiền. Validator đã chặn ở đường tạo mã, nhưng mã cũ
  // trong DB thì chỉ có chỗ này chặn được. (`applyRedemption` vốn đã kẹp đúng.)
  discount = Math.max(0, Math.min(discount, subtotal));

  return { discount, couponId: coupon.id };
}

// ---------------------------------------------------------------------------
// Reward redemption discount calculation
// ---------------------------------------------------------------------------

interface ApplyRedemptionParams {
  redemptionId: string;
  customerId: string | null;
  subtotal: number;
  couponDiscount: number;
}

async function applyRedemption(params: ApplyRedemptionParams, tx: TxOrDb): Promise<{ discount: number }> {
  const { redemptionId, customerId, subtotal, couponDiscount } = params;

  // Fetch the pending redemption (order_id IS NULL = not yet used)
  const [redemption] = await tx
    .select({
      id: schema.rewardRedemptions.id,
      customer_loyalty_id: schema.rewardRedemptions.customer_loyalty_id,
      discount_type: schema.rewards.discount_type,
      discount_value: schema.rewards.discount_value,
    })
    .from(schema.rewardRedemptions)
    .innerJoin(schema.rewards, eq(schema.rewardRedemptions.reward_id, schema.rewards.id))
    .where(
      and(
        eq(schema.rewardRedemptions.id, redemptionId),
        isNull(schema.rewardRedemptions.order_id),
      ),
    )
    .limit(1);

  if (!redemption) {
    throw new OrderValidationError("Canje no encontrado o ya fue utilizado");
  }

  // Validate ownership: redemption must belong to this customer
  if (customerId) {
    const [enrollment] = await tx
      .select({ customer_id: schema.customerLoyalty.customer_id })
      .from(schema.customerLoyalty)
      .where(eq(schema.customerLoyalty.id, redemption.customer_loyalty_id))
      .limit(1);

    if (!enrollment || enrollment.customer_id !== customerId) {
      throw new OrderValidationError("Este canje no te pertenece");
    }
  }

  // Calculate discount on the remaining amount after coupon
  const remainingSubtotal = subtotal - couponDiscount;
  let discount = 0;

  if (redemption.discount_type === "percentage") {
    discount = Math.round(remainingSubtotal * (redemption.discount_value / 100));
  } else {
    // fixed amount
    discount = Math.min(redemption.discount_value, remainingSubtotal);
  }

  discount = Math.max(0, Math.min(discount, remainingSubtotal));

  return { discount };
}

/**
 * Handles side effects when an order transitions to "completed":
 * - Awards loyalty points (if customer has enrollment)
 * - Deducts inventory (if enabled and not already deducted)
 */
export async function handleOrderCompletion(params: {
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  customerId: string | null;
  organizationId: string;
  branchId: string;
  inventoryDeducted: boolean;
}): Promise<void> {
  const {
    orderId,
    orderNumber,
    orderTotal,
    customerId,
    organizationId,
    branchId,
    inventoryDeducted,
  } = params;

  // Award loyalty points
  if (customerId) {
    try {
      await awardPoints({
        customerId,
        orderId,
        orderTotal,
        orderNumber,
        organizationId,
      });
    } catch (err) {
      logger.error("Error awarding loyalty points", { orderId, error: (err as Error).message });
    }
  }

  // Deduct inventory
  if (!inventoryDeducted) {
    try {
      await deductForOrder({
        orderId,
        orderNumber,
        branchId,
      });
    } catch (err) {
      logger.error("Inventory deduction error", { orderId, error: (err as Error).message });
    }
  }
}

/**
 * Custom error class for order validation failures.
 * Route handlers catch this to return 400 responses.
 */
export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}
