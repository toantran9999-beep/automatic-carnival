import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@restai/db";

/**
 * Dựng gói tin `order:new` — thứ Trạm quầy dùng để IN PHIẾU ĐẶT MÓN.
 *
 * ⚠️ Gói tin này phải đủ để in mà KHÔNG cần gọi thêm gì: phiếu không do máy bấm
 * đơn in ra (điện thoại phục vụ không có máy in), mà do Trạm quầy nghe được rồi
 * tự in. Thiếu số bàn hay tên nhân viên ở đây là phiếu in ra thiếu luôn.
 *
 * Trước đây khối này bị **chép đôi** ở route tạo đơn và route thêm món; nay có
 * thêm hai đường nữa (đòi lại phiếu chưa in, in lại phiếu) nên gom về một chỗ —
 * bốn bản chép tay thì sửa một chỗ không lan sang ba chỗ kia.
 */
export interface OrderTicketOrder {
  id: string;
  order_number: string;
  status: string;
  customer_name: string | null;
  type: string;
  table_session_id: string | null;
  created_at: Date | string;
}

export interface OrderTicketItem {
  id: string;
  name: string;
  quantity: number;
  status: string;
  notes: string | null;
  unit: string | null;
}

export interface BuildOrderTicketArgs {
  order: OrderTicketOrder;
  items: OrderTicketItem[];
  branchId: string;
  /** Id nhân viên bấm đơn — hàm tự tra tên. Bỏ qua khi đã có `staffName`. */
  staffUserId?: string | null;
  /** Tên nhân viên nếu nơi gọi đã biết sẵn (khỏi tra lại). */
  staffName?: string | null;
  /** Lô món thêm. Có giá trị thì phiếu in ra chỉ gồm món vừa thêm + chữ "THÊM MÓN". */
  addOnId?: string | null;
  /**
   * Khóa của một lần IN LẠI. Trạm quầy chống in trùng theo
   * `reprintToken || addOnId || orderId`, nên in lại phải có khóa mới.
   * ⚠️ Đừng mượn `addOnId` cho việc này — nó làm phiếu ghi "THÊM MÓN" sai sự thật.
   */
  reprintToken?: string | null;
  /** Ghi đè giờ trên phiếu (lô món thêm dùng giờ hiện tại, không phải giờ mở đơn). */
  createdAt?: string;
}

async function resolveStaffName(
  staffUserId?: string | null,
  staffName?: string | null,
): Promise<string | null> {
  if (staffName !== undefined && staffName !== null) return staffName;
  if (!staffUserId) return null;
  // Token chỉ có id, không có tên. Hỏng thì để trống chứ không chặn bán hàng.
  try {
    const [staff] = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, staffUserId))
      .limit(1);
    return staff?.name ?? null;
  } catch {
    return null;
  }
}

export async function buildOrderTicketPayload(args: BuildOrderTicketArgs) {
  const { order, items, branchId } = args;

  let tableNumber: number | null = null;
  let tableZone: string | null = null;
  if (order.table_session_id) {
    const [tbl] = await db
      .select({ number: schema.tables.number, zone: schema.spaces.name })
      .from(schema.tableSessions)
      .innerJoin(schema.tables, eq(schema.tableSessions.table_id, schema.tables.id))
      .leftJoin(schema.spaces, eq(schema.tables.space_id, schema.spaces.id))
      .where(eq(schema.tableSessions.id, order.table_session_id))
      .limit(1);
    tableNumber = tbl?.number ?? null;
    tableZone = tbl?.zone ?? null;
  }

  const itemIds = items.map((i) => i.id);
  const itemModifiers = itemIds.length
    ? await db
        .select({
          order_item_id: schema.orderItemModifiers.order_item_id,
          name: schema.orderItemModifiers.name,
        })
        .from(schema.orderItemModifiers)
        .where(inArray(schema.orderItemModifiers.order_item_id, itemIds))
    : [];
  const modsByItem = new Map<string, string[]>();
  for (const m of itemModifiers) {
    const arr = modsByItem.get(m.order_item_id) ?? [];
    arr.push(m.name);
    modsByItem.set(m.order_item_id, arr);
  }

  const staffName = await resolveStaffName(args.staffUserId, args.staffName);

  return {
    orderId: order.id,
    // ⚠️ Trạm quầy nghe phòng của MỌI chi nhánh trong token (ws/handlers.ts tự
    // vào phòng theo `payload.branches`). Không gửi kèm mã chi nhánh thì quầy
    // chi nhánh này in luôn phiếu của chi nhánh kia.
    branchId,
    ...(args.addOnId ? { addOnId: args.addOnId } : {}),
    ...(args.reprintToken ? { reprintToken: args.reprintToken } : {}),
    orderNumber: order.order_number,
    status: order.status,
    tableNumber,
    tableZone,
    customerName: order.customer_name,
    /** Người bấm đơn — trạm quầy in đúng tên này lên dòng "Nhân viên". */
    staffName,
    createdAt: args.createdAt ?? order.created_at,
    orderType: order.type,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      // Topping/tùy chọn tách riêng để phiếu in mỗi topping 1 dòng
      modifiers: modsByItem.get(i.id) ?? [],
      quantity: i.quantity,
      status: i.status,
      notes: i.notes,
      unit: i.unit ?? null,
    })),
  };
}

/** Bọc payload vào phong bì WebSocket và bắn ra cả phòng chi nhánh lẫn phòng bếp. */
export function orderTicketEnvelope(payload: Awaited<ReturnType<typeof buildOrderTicketPayload>>) {
  return { type: "order:new" as const, payload, timestamp: Date.now() };
}
