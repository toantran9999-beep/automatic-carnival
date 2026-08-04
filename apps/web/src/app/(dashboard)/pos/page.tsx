"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@restai/ui/components/sheet";
import { Button } from "@restai/ui/components/button";
import { formatCurrency } from "@/lib/utils";
import { useCategories, useMenuItems, useBestSellers } from "@/hooks/use-menu";
import { useCreateOrder, useAddOrderItems } from "@/hooks/use-orders";
import { useCreatePaymentRequest } from "@/hooks/use-payments";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";
import { ProductGrid } from "./_components/product-grid";
import { CartSidebar } from "./_components/cart-sidebar";
import { ModifierDialog, type CartModifier } from "./_components/modifier-dialog";
import { CustomItemDialog } from "./_components/custom-item-dialog";
import { useBranchSettings } from "@/hooks/use-settings";
import { PosPaymentDialog } from "./_components/pos-payment-dialog";
import { ShiftClosedBlocker } from "./_components/shift-controls";
import { useTableActiveSession } from "@/hooks/use-tables";
import { useCurrentShift } from "@/hooks/use-shifts";
import { useAuthStore } from "@/stores/auth-store";
import { canTouchLiveOps } from "@/lib/roles";
import { useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types (exported for child components)
// ---------------------------------------------------------------------------

export interface PosCartItem {
  lineId: string;
  /** Rỗng = món nhập tay (khách gọi ngoài menu). */
  menuItemId?: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  notes?: string;
  unit?: string;
  modifiers: CartModifier[];
}

let lineCounter = 0;
function nextLineId() {
  return `line-${++lineCounter}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// POS Page
// ---------------------------------------------------------------------------

export default function PosPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeout">("dine_in");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const { t, lang } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: currentShift, isLoading: shiftLoading } = useCurrentShift();
  // Mở/đóng ca là chốt tiền mặt → chỉ người ở quầy. Quản lý đã bị chặn ở máy chủ
  // (blockLiveOps), bỏ khỏi đây để không hiện nút bấm vào là báo lỗi.
  const canManageShift = user?.role === "cashier";
  const canOperate = canTouchLiveOps(user?.role);

  // Selected table state
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [autoPay, setAutoPay] = useState(false);
  /** Có = đang thêm món vào đơn mang về này, không phải tạo đơn mới. */
  const [addToOrderId, setAddToOrderId] = useState<string | null>(null);

  /**
   * Lối vào QUYẾT ĐỊNH loại đơn — và là cửa duy nhất vào màn bán hàng.
   *
   * ⚠️ Quy tắc "không chọn bàn thì không vào được màn bán hàng" trước đây chỉ là ẩn
   * mục menu (`hide_pos_nav`) + làm mờ nút Gửi, nên lách được: vào `/pos?takeout=1`
   * rồi gạt nút "Ăn tại bàn" ngay trong giỏ và chọn bàn từ ô sổ xuống. Nay nút gạt
   * và ô chọn bàn đã bỏ khỏi giỏ, còn đây là chốt cửa: vào `/pos` trần → đá về
   * sơ đồ bàn.
   *
   * ⚠️ Chốt PHẢI nằm trong chính effect này, sau khi đọc xong tham số. Tách ra một
   * effect riêng là nó chạy trước lúc state kịp gán → đá văng cả người vào đúng đường.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tId = params.get("tableId");
    const tNum = params.get("tableNumber");
    const isTakeout = params.get("takeout") === "1";
    // Thêm món vào đơn mang về đang mở (khách quay lại mua thêm)
    const addId = params.get("addToOrderId");

    if (!tId && !isTakeout && !addId) {
      router.replace("/tables");
      return;
    }

    if (tId) {
      setTableId(tId);
      setOrderType("dine_in");
    }
    if (tNum) {
      setTableNumber(tNum);
    }
    if (params.get("pay") === "1") {
      setAutoPay(true);
    }
    if (isTakeout) {
      setOrderType("takeout");
    }
    if (addId) {
      setAddToOrderId(addId);
      setOrderType("takeout");
    }
  }, [router]);

  // Modifier dialog state
  const [modDialogItem, setModDialogItem] = useState<any>(null);
  const [modDialogOpen, setModDialogOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  const { data: categories } = useCategories();
  // Lấy toàn bộ món 1 lần, lọc danh mục/tìm kiếm phía client (đổi danh mục tức thì + đếm số món).
  const { data: menuItems, isLoading: itemsLoading } = useMenuItems();
  // Nhóm ảo "Bán chạy" — server đã trả rỗng nếu chủ quán tắt trong Cài đặt
  const { data: bestSellers } = useBestSellers();

  // Không có "Tất cả" — mặc định vào thẳng danh mục đầu tiên cho lưới nhẹ, đỡ render 50+ ô
  useEffect(() => {
    if (selectedCategory === null && categories?.length) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);
  const createOrder = useCreateOrder();
  const addOrderItems = useAddOrderItems();
  const createPaymentRequest = useCreatePaymentRequest();

  const { data: branchSettings } = useBranchSettings();
  const qc = useQueryClient();

  const { data: activeSessionData } = useTableActiveSession(tableId);
  const activeSession = activeSessionData;

  // Payment states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [paymentOrderNumber, setPaymentOrderNumber] = useState("");
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentTax, setPaymentTax] = useState(0);
  const [paymentTableNumber, setPaymentTableNumber] = useState<string | null>(null);
  const [paymentCart, setPaymentCart] = useState<PosCartItem[]>([]);

  const allItems: any[] = menuItems ?? [];

  const handleItemClick = useCallback((item: any) => {
    setModDialogItem(item);
    setModDialogOpen(true);
  }, []);

  const handleAddFromDialog = useCallback(
    (item: any, qty: number, mods: CartModifier[], notes: string) => {
      if (mods.length === 0) {
        const existing = cart.find(
          (c) => c.menuItemId === item.id && c.modifiers.length === 0
        );
        if (existing) {
          setCart((prev) =>
            prev.map((c) =>
              c.lineId === existing.lineId ? { ...c, quantity: c.quantity + qty } : c
            )
          );
          return;
        }
      }

      setCart((prev) => [
        ...prev,
        {
          lineId: nextLineId(),
          menuItemId: item.id,
          name: item.name,
          imageUrl: item.image_url || null,
          unitPrice: item.price,
          quantity: qty,
          notes: notes || undefined,
          unit: item.unit || undefined,
          modifiers: mods,
        },
      ]);
    },
    [cart]
  );

  /** Thêm món nhập tay (ngoài menu) — nhân viên tự đặt tên + giá (đồng). */
  const handleAddCustomItem = useCallback(
    (name: string, priceVnd: number, qty: number, notes: string) => {
      setCart((prev) => [
        ...prev,
        {
          lineId: nextLineId(),
          menuItemId: undefined,
          name: name.trim(),
          imageUrl: null,
          unitPrice: Math.round(priceVnd) * 100, // đồng -> cents
          quantity: qty,
          notes: notes || undefined,
          modifiers: [],
        },
      ]);
    },
    []
  );

  /** Chuyển giỏ POS thành payload gửi API (phân biệt món menu vs món nhập tay). */
  const toOrderItems = (items: PosCartItem[]) =>
    items.map((item) =>
      item.menuItemId
        ? {
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes || undefined,
            // Bỏ tùy chọn đã bị xóa khỏi thực đơn (modifierId null) — gửi lên là
            // máy chủ báo lỗi. Đơn cũ vẫn in ra được vì tên/giá đã chụp ảnh sẵn.
            modifiers: item.modifiers
              .filter((m): m is typeof m & { modifierId: string } => !!m.modifierId)
              .map((m) => ({ modifierId: m.modifierId })),
          }
        : {
            customName: item.name,
            customPrice: item.unitPrice,
            quantity: item.quantity,
            notes: item.notes || undefined,
            modifiers: [],
          }
    );

  const updateCartQty = (lineId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.lineId !== lineId));
    } else {
      setCart((prev) => prev.map((c) => (c.lineId === lineId ? { ...c, quantity: qty } : c)));
    }
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => prev.filter((c) => c.lineId !== lineId));
  };

  /**
   * Xin phiếu tạm tính (có QR chuyển khoản) — TRẠM QUẦY in, không phải máy này.
   *
   * ⚠️ Trước đây hàm này tự gọi lệnh in ngay tại máy bấm đơn, mà máy bấm đơn thường
   * là điện thoại không có máy in → mã QR chỉ hiện trên màn hình điện thoại. Chủ
   * quán chốt: mọi mã QR phải in ở quầy rồi bưng ra cho khách. Máy chủ nhận yêu cầu
   * xong sẽ phát WS `print:transfer`, StationProvider ở quầy lo phần in.
   *
   * Cũng nhờ vậy mà bỏ được `qrPayload: … || payment_code` ở bản cũ — cái fallback
   * đó in ra "TODA-…" nên app ngân hàng báo "Mã thanh toán không hợp lệ".
   */
  const printTemporaryBill = async (args: { orderId: string; total: number }) => {
    await createPaymentRequest.mutateAsync({
      orderId: args.orderId,
      amount: args.total,
    });
  };

  const handlePrintTemporaryBill = async () => {
    try {
      if (cart.length > 0) {
        if (orderType === "dine_in" && !tableId) {
          toast.error(lang === "vi" ? "Vui lòng chọn bàn cho đơn ăn tại bàn" : "Please select a table for dine-in");
          return;
        }
        const result = await createOrder.mutateAsync({
          type: orderType,
          customerName: customerName || t("pos.customerPOS"),
          items: toOrderItems(cart),
          notes: orderNotes || undefined,
          tableId: orderType === "dine_in" ? (tableId || undefined) : undefined,
        });

        const subtotal = cart.reduce((sum, item) => {
          const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
          return sum + (item.unitPrice + modTotal) * item.quantity;
        }, 0);

        // Tiền thuế do máy chủ tự tính khi dựng phiếu — ở đây chỉ cần tổng tiền.
        await printTemporaryBill({ orderId: result.id, total: subtotal });

        setCart([]);
        setCustomerName("");
        setOrderNotes("");
        qc.invalidateQueries({ queryKey: ["tables"] });
        qc.invalidateQueries({ queryKey: ["sessions"] });
        toast.success("Đã gửi phiếu tạm tính ra trạm quầy");
        return;
      }

      const unpaidOrders = activeSession?.orders?.filter(
        (o: any) => o.status !== "completed" && o.status !== "cancelled",
      ) || [];
      if (unpaidOrders.length === 0) return;

      const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);
      // Gửi đơn đầu + tổng tiền cả phiên: máy chủ tự gom các đơn mà số tiền này
      // trả tới (giống hệt cách nó rải tiền khi khách chuyển xong), rồi in một
      // phiếu duy nhất. Trước đây phần gom món làm ở đây nên phiếu và tiền có thể
      // lệch nhau nếu khách gọi thêm giữa chừng.
      await printTemporaryBill({ orderId: unpaidOrders[0].id, total: unpaidTotal });
      toast.success("Đã gửi phiếu tạm tính ra trạm quầy");
    } catch (err: any) {
      toast.error(err.message || "Không gửi được phiếu tạm tính");
    }
  };

  const handleCreateOrder = async (payImmediately = false) => {
    if (cart.length === 0) return;

    // Thêm món vào đơn có sẵn: KHÔNG tạo đơn mới, cộng thẳng vào đơn cũ để khách
    // vẫn cầm một số phiếu và quầy đối soát một dòng.
    if (addToOrderId) {
      try {
        await addOrderItems.mutateAsync({ orderId: addToOrderId, items: toOrderItems(cart) });
        setCart([]);
        toast.success(lang === "vi" ? "Đã thêm món vào đơn" : "Items added to order");
        qc.invalidateQueries({ queryKey: ["tables", "takeaway"] });
        router.push("/tables");
      } catch (err: any) {
        toast.error(err.message || (lang === "vi" ? "Không thêm được món" : "Could not add items"));
      }
      return;
    }

    if (orderType === "dine_in" && !tableId) {
      toast.error(lang === "vi" ? "Vui lòng chọn bàn cho đơn ăn tại bàn" : "Please select a table for dine-in");
      return;
    }
    try {
      const result = await createOrder.mutateAsync({
        type: orderType,
        customerName: customerName || t("pos.customerPOS"),
        items: toOrderItems(cart),
        notes: orderNotes || undefined,
        tableId: orderType === "dine_in" ? (tableId || undefined) : undefined,
      });

      const oNumber = result.order_number || result.orderNumber || "";
      const oId = result.id;
      const taxRate = branchSettings?.tax_rate ?? 1000;

      // Calculate total and tax for this order (in cents)
      const subtotal = cart.reduce((sum, item) => {
        const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
        return sum + (item.unitPrice + modTotal) * item.quantity;
      }, 0);
      const taxAmount = Math.round(subtotal - (subtotal / (1 + (taxRate / 10000))));

      if (payImmediately) {
        setPaymentOrderId(oId);
        setPaymentOrderNumber(oNumber);
        setPaymentTotal(subtotal); // total = subtotal
        setPaymentTax(taxAmount);
        setPaymentTableNumber(tableNumber);
        setPaymentCart(cart);
        setPaymentDialogOpen(true);
      } else {
        // KHÔNG in tại đây. Phiếu bếp được in tập trung ở "Trạm quầy" (máy POS
        // có máy in) khi nó nhận sự kiện WS `order:new`. Nhờ vậy nhân viên order
        // bằng điện thoại (không có máy in) vẫn đẩy được phiếu về quầy.
        // Xem StationProvider + StationToggle.

        // Về thẳng sơ đồ bàn, KHÔNG hiện bảng "Đặt hàng thành công".
        //
        // Bảng đó chỉ có mỗi nút "Đơn hàng mới" mà việc duy nhất của nó là tự đóng
        // lại — giờ cao điểm là hai thao tác thừa mỗi đơn (bấm đóng, rồi tự bấm về
        // Bàn ăn). Số phiếu đưa vào toast nên không mất thông tin nào.
        //
        // Không cần dọn state ở đây: rời trang là POS unmount, state đi theo.
        setCart([]);
        qc.invalidateQueries({ queryKey: ["tables"] });
        qc.invalidateQueries({ queryKey: ["sessions"] });
        toast.success(
          oNumber
            ? (lang === "vi" ? `Đã gửi phiếu #${oNumber}` : `Order #${oNumber} sent`)
            : t("pos.orderCreated"),
        );
        router.push("/tables");
      }
    } catch (err: any) {
      toast.error(err.message || t("pos.orderCreateError"));
    }
  };

  const handlePayUnpaidOrders = () => {
    const unpaidOrders = activeSession?.orders?.filter((o: any) => o.status !== "completed" && o.status !== "cancelled") || [];
    if (unpaidOrders.length === 0) return;
    
    const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);
    const taxRate = branchSettings?.tax_rate ?? 1000;
    const unpaidTax = Math.round(unpaidTotal - (unpaidTotal / (1 + (taxRate / 10000))));
    const targetOrder = unpaidOrders[0];
    
    const allOrderedItems: PosCartItem[] = unpaidOrders.flatMap((order: any) => 
      order.items.map((item: any) => ({
        lineId: item.id,
        menuItemId: item.menu_item_id,
        name: item.name,
        imageUrl: item.image_url || null,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        notes: item.notes || undefined,
        modifiers: item.modifiers || [],
      }))
    );

    setPaymentOrderId(targetOrder.id);
    setPaymentOrderNumber(targetOrder.order_number);
    setPaymentTotal(unpaidTotal);
    setPaymentTax(unpaidTax);
    setPaymentTableNumber(tableNumber);
    setPaymentCart(allOrderedItems);
    setPaymentDialogOpen(true);
  };

  // Tự mở hộp thoại thanh toán khi vào từ nút "Thanh toán" ở màn Bàn (?pay=1)
  useEffect(() => {
    if (!autoPay) return;
    const unpaid = activeSession?.orders?.filter(
      (o: any) => o.status !== "completed" && o.status !== "cancelled",
    ) || [];
    if (unpaid.length > 0) {
      handlePayUnpaidOrders();
      setAutoPay(false);
    }
  }, [autoPay, activeSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Thu tiền xong cũng về sơ đồ bàn, cùng lý do với luồng đặt món: đứng lại ở màn
  // bán hàng trống là thu ngân phải tự bấm về, thêm một thao tác mỗi lượt khách.
  const handlePaymentSuccess = () => {
    setCart([]);
    qc.invalidateQueries({ queryKey: ["tables"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    router.push("/tables");
  };

  // Floating-bar summary (mobile)
  const cartSubtotal = cart.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.unitPrice + modTotal) * item.quantity;
  }, 0);
  const cartQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const unpaidOrders = activeSession?.orders?.filter(
    (o: any) => o.status !== "completed" && o.status !== "cancelled",
  ) || [];
  const hasUnpaid = unpaidOrders.length > 0;
  const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);
  const showMobileBar = cart.length > 0 || hasUnpaid;

  // Shared cart props (rendered twice: desktop inline + mobile sheet)
  const cartProps = {
    cart,
    orderType,
    customerName,
    orderNotes,
    isPending: createOrder.isPending,
    tableNumber,
    onCustomerNameChange: setCustomerName,
    onOrderNotesChange: setOrderNotes,
    onUpdateQty: updateCartQty,
    onRemove: removeFromCart,
    onClearCart: () => setCart([]),
    onPrintTemporaryBill: handlePrintTemporaryBill,
    activeSession,
    needsTable: orderType === "dine_in" && !tableId,
  };

  // Nhân viên có thanh menu cố định dưới ở MỌI cỡ màn hình → luôn trừ 7.5rem (header + bottom nav)
  const staffNav = !!user && ["cashier", "waiter", "kitchen"].includes(user.role);
  const posHeightClass = staffNav
    ? "h-[calc(100dvh-7.5rem)]"
    : "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-5rem)]";

  // Cổng: quản lý/admin không bán hàng — khoá HẲN màn này thay vì mở ra rồi vô hiệu
  // từng nút. Màn bán hàng có quá nhiều đường dẫn tới thao tác (chọn món, giỏ hàng,
  // hộp thoại thanh toán, link ?pay=1 cũ); khoá từng chỗ chỉ cần sót một là lọt.
  // Số liệu quản lý cần đã có ở Bảng điều khiển và trang Bàn ăn.
  if (!canOperate) {
    return (
      <div className={`flex ${posHeightClass}`}>
        <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold">
            {lang === "vi" ? "Chế độ chỉ xem" : "View only"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {lang === "vi"
              ? "Tài khoản quản lý không bán hàng. Dùng tài khoản chi nhánh đăng nhập tại quầy để order và thanh toán."
              : "Manager accounts cannot sell. Use the branch account at the counter to order and take payment."}
          </p>
          <Button variant="outline" onClick={() => router.push("/tables")}>
            {lang === "vi" ? "Xem tình trạng bàn" : "View tables"}
          </Button>
        </div>
      </div>
    );
  }

  // Cổng: chưa mở ca → khóa toàn bộ màn đặt món (mở ca mới xài được chức năng).
  if (!shiftLoading && !currentShift) {
    return (
      <div className={`flex ${posHeightClass}`}>
        <ShiftClosedBlocker canManage={canManageShift} />
      </div>
    );
  }

  return (
    <div className={`flex ${posHeightClass} flex-col gap-2`}>
      {/* Nói rõ đang thêm vào đơn nào — không có dòng này thì màn hình y hệt lúc bán
          đơn mới, nhân viên dễ tưởng mình đang mở đơn thứ hai cho cùng một khách. */}
      {addToOrderId && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
          <span>
            {lang === "vi"
              ? "Đang thêm món vào đơn mang về đang mở"
              : "Adding items to an open takeaway order"}
          </span>
          <Button size="sm" variant="ghost" onClick={() => router.push("/tables")}>
            {lang === "vi" ? "Thoát" : "Cancel"}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3">
        <ProductGrid
          categories={categories ?? []}
          items={allItems}
          isLoading={itemsLoading}
          search={search}
          onSearchChange={setSearch}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          cart={cart}
          onItemClick={handleItemClick}
          onAddCustom={() => setCustomDialogOpen(true)}
          bestSellerIds={(bestSellers ?? []).map((b) => b.menuItemId)}
          showBestSellers={branchSettings?.settings?.show_best_sellers ?? true}
        />

        {/* Desktop cart (inline sidebar) */}
        <CartSidebar
          {...cartProps}
          className="hidden w-[332px] flex-col border-l pl-3 md:flex xl:w-[352px]"
          onCreateOrder={handleCreateOrder}
          onPayUnpaidOrders={handlePayUnpaidOrders}
        />
      </div>

      {/* Mobile floating bar -> opens cart in a bottom sheet */}
      {showMobileBar && (
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
          className="md:hidden fixed left-0 right-0 z-40 mx-3 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-5 w-5" />
            {cart.length > 0 ? `${cartQty} ${t("pos.cartTitle")}` : t("pos.cartTitle")}
          </span>
          <span className="font-bold">
            {formatCurrency(cart.length > 0 ? cartSubtotal : unpaidTotal)}
          </span>
        </button>
      )}

      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetContent side="bottom" className="h-[88vh] flex flex-col p-4 md:hidden">
          <SheetHeader className="mb-2">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              {t("pos.cartTitle")}
            </SheetTitle>
          </SheetHeader>
          <CartSidebar
            {...cartProps}
            className="flex flex-1 min-h-0 flex-col"
            onCreateOrder={(pay) => {
              setCartSheetOpen(false);
              handleCreateOrder(pay);
            }}
            onPayUnpaidOrders={() => {
              setCartSheetOpen(false);
              handlePayUnpaidOrders();
            }}
          />
        </SheetContent>
      </Sheet>

      <ModifierDialog
        item={modDialogItem}
        open={modDialogOpen}
        onClose={() => setModDialogOpen(false)}
        onAdd={handleAddFromDialog}
      />

      <CustomItemDialog
        open={customDialogOpen}
        onClose={() => setCustomDialogOpen(false)}
        onAdd={handleAddCustomItem}
      />

      <PosPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        orderId={paymentOrderId}
        orderNumber={paymentOrderNumber}
        totalAmount={paymentTotal}
        taxAmount={paymentTax}
        cart={paymentCart}
        customerName={customerName || undefined}
        notes={orderNotes || undefined}
        tableNumber={paymentTableNumber}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
