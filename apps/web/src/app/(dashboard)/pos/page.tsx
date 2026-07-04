"use client";

import { useState, useCallback, useEffect } from "react";
import { ShoppingCart } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@restai/ui/components/sheet";
import { formatCurrency } from "@/lib/utils";
import { useCategories, useMenuItems } from "@/hooks/use-menu";
import { useCreateOrder } from "@/hooks/use-orders";
import { useCreatePaymentRequest } from "@/hooks/use-payments";
import { useTables } from "@/hooks/use-tables";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";
import { ProductGrid } from "./_components/product-grid";
import { CartSidebar } from "./_components/cart-sidebar";
import { ModifierDialog, type CartModifier } from "./_components/modifier-dialog";
import { SuccessDialog } from "./_components/success-dialog";
import { useBranchSettings } from "@/hooks/use-settings";
import { usePrintTemporaryTransferBill } from "@/components/print-ticket";
import { PosPaymentDialog } from "./_components/pos-payment-dialog";
import { ShiftBar, ShiftClosedBlocker } from "./_components/shift-controls";
import { useTableActiveSession } from "@/hooks/use-tables";
import { useCurrentShift } from "@/hooks/use-shifts";
import { useAuthStore } from "@/stores/auth-store";
import { useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types (exported for child components)
// ---------------------------------------------------------------------------

export interface PosCartItem {
  lineId: string;
  menuItemId: string;
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
  const [successDialog, setSuccessDialog] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState("");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const { t, lang } = useTranslation();
  const { user } = useAuthStore();
  const { data: currentShift, isLoading: shiftLoading } = useCurrentShift();
  const canManageShift =
    !!user && ["super_admin", "org_admin", "branch_manager", "cashier"].includes(user.role);

  // Selected table state
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [autoPay, setAutoPay] = useState(false);

  // Parse table parameters from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tId = params.get("tableId");
      const tNum = params.get("tableNumber");
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
      if (params.get("takeout") === "1") {
        setOrderType("takeout");
      }
    }
  }, []);

  // Modifier dialog state
  const [modDialogItem, setModDialogItem] = useState<any>(null);
  const [modDialogOpen, setModDialogOpen] = useState(false);

  const { data: categories } = useCategories();
  // Lấy toàn bộ món 1 lần, lọc danh mục/tìm kiếm phía client (đổi danh mục tức thì + đếm số món).
  const { data: menuItems, isLoading: itemsLoading } = useMenuItems();
  const { data: tablesData } = useTables();
  const createOrder = useCreateOrder();
  const createPaymentRequest = useCreatePaymentRequest();

  const { data: branchSettings } = useBranchSettings();
  const printTemporaryTransferBill = usePrintTemporaryTransferBill();
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
  const tables: any[] = tablesData?.tables ?? [];

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

  const mapTicketItems = (items: PosCartItem[]) =>
    items.map((i) => {
      const modTotal = i.modifiers.reduce((sum, m) => sum + m.price, 0);
      const nameWithMods = i.modifiers.length > 0
        ? `${i.name} (${i.modifiers.map((m) => m.name).join(", ")})`
        : i.name;
      return {
        name: nameWithMods,
        quantity: i.quantity,
        unit_price: i.unitPrice + modTotal,
        total: (i.unitPrice + modTotal) * i.quantity,
        notes: i.notes,
        unit: i.unit,
      };
    });

  const printTemporaryBill = async (args: {
    orderId: string;
    orderNumber: string;
    total: number;
    tax: number;
    items: PosCartItem[];
  }) => {
    const request = await createPaymentRequest.mutateAsync({
      orderId: args.orderId,
      amount: args.total,
    }) as any;

    printTemporaryTransferBill({
      businessName: (branchSettings as any)?.name || "TODA POS",
      address: (branchSettings as any)?.address || undefined,
      orderNumber: args.orderNumber,
      tableNumber,
      customerName: customerName || undefined,
      createdAt: new Date().toISOString(),
      expiresAt: request.expires_at,
      items: mapTicketItems(args.items),
      subtotal: args.total - args.tax,
      tax: args.tax,
      total: args.total,
      paymentCode: request.payment_code,
      qrUrl: request.qr_url,
      qrPayload: request.qr_payload || request.payment_code,
      bank: request.bank,
    });
  };

  const handlePrintTemporaryBill = async () => {
    try {
      const taxRate = branchSettings?.tax_rate ?? 1000;

      if (cart.length > 0) {
        if (orderType === "dine_in" && !tableId) {
          toast.error(lang === "vi" ? "Vui lòng chọn bàn cho đơn ăn tại bàn" : "Please select a table for dine-in");
          return;
        }
        const result = await createOrder.mutateAsync({
          type: orderType,
          customerName: customerName || t("pos.customerPOS"),
          items: cart.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            notes: item.notes || undefined,
            modifiers: item.modifiers.map((m) => ({ modifierId: m.modifierId })),
          })),
          notes: orderNotes || undefined,
          tableId: orderType === "dine_in" ? (tableId || undefined) : undefined,
        });

        const subtotal = cart.reduce((sum, item) => {
          const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
          return sum + (item.unitPrice + modTotal) * item.quantity;
        }, 0);
        const taxAmount = Math.round(subtotal - subtotal / (1 + taxRate / 10000));

        await printTemporaryBill({
          orderId: result.id,
          orderNumber: result.order_number || result.orderNumber || "",
          total: subtotal,
          tax: taxAmount,
          items: cart,
        });

        setCart([]);
        setCustomerName("");
        setOrderNotes("");
        qc.invalidateQueries({ queryKey: ["tables"] });
        qc.invalidateQueries({ queryKey: ["sessions"] });
        toast.success("Đã in phiếu tạm tính");
        return;
      }

      const unpaidOrders = activeSession?.orders?.filter(
        (o: any) => o.status !== "completed" && o.status !== "cancelled",
      ) || [];
      if (unpaidOrders.length === 0) return;

      const unpaidTotal = unpaidOrders.reduce((sum: number, o: any) => sum + o.total, 0);
      const unpaidTax = Math.round(unpaidTotal - unpaidTotal / (1 + taxRate / 10000));
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
          unit: item.unit || undefined,
          modifiers: item.modifiers || [],
        })),
      );

      await printTemporaryBill({
        orderId: targetOrder.id,
        orderNumber: targetOrder.order_number,
        total: unpaidTotal,
        tax: unpaidTax,
        items: allOrderedItems,
      });
      toast.success("Đã in phiếu tạm tính");
    } catch (err: any) {
      toast.error(err.message || "Không in được phiếu tạm tính");
    }
  };

  const handleCreateOrder = async (payImmediately = false) => {
    if (cart.length === 0) return;
    if (orderType === "dine_in" && !tableId) {
      toast.error(lang === "vi" ? "Vui lòng chọn bàn cho đơn ăn tại bàn" : "Please select a table for dine-in");
      return;
    }
    try {
      const result = await createOrder.mutateAsync({
        type: orderType,
        customerName: customerName || t("pos.customerPOS"),
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes || undefined,
          modifiers: item.modifiers.map((m) => ({ modifierId: m.modifierId })),
        })),
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

      setLastOrderNumber(oNumber);

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

        // Clear state and cart
        setCart([]);
        setCustomerName("");
        setOrderNotes("");
        setTableId(null);
        setTableNumber(null);
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", window.location.pathname);
        }
        qc.invalidateQueries({ queryKey: ["tables"] });
        qc.invalidateQueries({ queryKey: ["sessions"] });
        setSuccessDialog(true);
        toast.success(t("pos.orderCreated"));
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

  const handlePaymentSuccess = () => {
    setCart([]);
    setCustomerName("");
    setOrderNotes("");
    setTableId(null);
    setTableNumber(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    qc.invalidateQueries({ queryKey: ["tables"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  const handleTableClear = () => {
    setTableId(null);
    setTableNumber(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
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
    tableId,
    tableNumber,
    tables,
    onTableSelect: (id: string, num: number) => {
      setTableId(id);
      setTableNumber(String(num));
    },
    onTableClear: handleTableClear,
    onOrderTypeChange: setOrderType,
    onCustomerNameChange: setCustomerName,
    onOrderNotesChange: setOrderNotes,
    onUpdateQty: updateCartQty,
    onRemove: removeFromCart,
    onClearCart: () => setCart([]),
    onPrintTemporaryBill: handlePrintTemporaryBill,
    activeSession,
    needsTable: orderType === "dine_in" && !tableId,
  };

  // Cổng: chưa mở ca → khóa toàn bộ màn đặt món (mở ca mới xài được chức năng).
  if (!shiftLoading && !currentShift) {
    return (
      <div className="flex h-[calc(100dvh-8rem)]">
        <ShiftClosedBlocker canManage={canManageShift} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-2">
      {currentShift && <ShiftBar shift={currentShift} canManage={canManageShift} />}
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

      <SuccessDialog
        open={successDialog}
        onOpenChange={setSuccessDialog}
        orderNumber={lastOrderNumber}
      />

      <ModifierDialog
        item={modDialogItem}
        open={modDialogOpen}
        onClose={() => setModDialogOpen(false)}
        onAdd={handleAddFromDialog}
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
