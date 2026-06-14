"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { WsMessage, WsOrderPayload } from "@restai/types";
import { useAuthStore } from "@/stores/auth-store";
import { useStationStore } from "@/stores/station-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { usePrintKitchenTicket } from "@/components/print-ticket";
import { useBranchSettings } from "@/hooks/use-settings";
import { useTranslation } from "@/stores/lang-store";

/** Tiếng "ting" ngắn báo có đơn mới (Web Audio, không cần file asset). */
function beep() {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => ctx.close();
  } catch {
    // Âm thanh là phụ trợ — bỏ qua nếu trình duyệt chặn.
  }
}

/**
 * Chạy nền trong layout dashboard. Chỉ thiết bị được đặt làm "Trạm quầy"
 * (useStationStore.isStation) mới mở kết nối WS và tự in phiếu bếp khi có
 * `order:new`. Các máy khác (điện thoại order) KHÔNG in.
 */
export function StationProvider() {
  const { accessToken, selectedBranchId } = useAuthStore();
  const isStation = useStationStore((s) => s.isStation);
  const { data: branchSettings } = useBranchSettings();
  const printKitchenTicket = usePrintKitchenTicket();
  const { lang } = useTranslation();
  const printedRef = useRef<Set<string>>(new Set());

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== "order:new") return;
      // Đọc state mới nhất phòng khi vừa tắt trạm.
      const station = useStationStore.getState();
      if (!station.isStation) return;

      const p = msg.payload as WsOrderPayload;
      if (!p?.orderId || printedRef.current.has(p.orderId)) return;
      printedRef.current.add(p.orderId);

      const mode =
        (branchSettings as any)?.settings?.print_mode === "per_item"
          ? "per_item"
          : "combined";

      printKitchenTicket(
        {
          orderNumber: p.orderNumber,
          tableNumber: p.tableNumber ?? undefined,
          customerName: p.customerName ?? undefined,
          createdAt: p.createdAt || new Date().toISOString(),
          items: (p.items ?? []).map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit_price: 0,
            total: 0,
            notes: i.notes,
            unit: i.unit ?? undefined,
          })),
        },
        mode
      ).catch((e: any) => {
        toast.error(
          (lang === "vi" ? "Lỗi in phiếu: " : "Print error: ") + (e?.message || "")
        );
      });

      if (station.soundEnabled) beep();

      const where =
        p.tableNumber != null
          ? `${lang === "vi" ? "Bàn" : "Table"} ${p.tableNumber}`
          : lang === "vi"
            ? "Mang về"
            : "Takeaway";
      toast.info(
        `${lang === "vi" ? "Đơn mới" : "New order"} #${p.orderNumber} · ${where}`
      );
    },
    [branchSettings, printKitchenTicket, lang]
  );

  useWebSocket(
    selectedBranchId && isStation ? [`branch:${selectedBranchId}`] : [],
    handleWsMessage,
    accessToken || undefined
  );

  return null;
}
