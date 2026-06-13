"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@restai/ui/components/button";
import { useStationStore } from "@/stores/station-store";
import { useTranslation } from "@/stores/lang-store";

/**
 * Bật/tắt "Trạm quầy" cho ĐÚNG thiết bị này (POS Android có máy in). Khi bật,
 * máy này tự in phiếu + kêu chuông mỗi khi có đơn mới (kể cả đơn từ điện thoại
 * nhân viên). Chỉ nên bật trên 1 máy ở quầy.
 */
export function StationToggle() {
  const isStation = useStationStore((s) => s.isStation);
  const setStation = useStationStore((s) => s.setStation);
  const { lang } = useTranslation();

  const label = isStation
    ? lang === "vi"
      ? "Trạm quầy: ĐANG BẬT (máy này tự in đơn mới)"
      : "Print station: ON (this device auto-prints new orders)"
    : lang === "vi"
      ? "Trạm quầy: tắt — bấm để biến máy này thành trạm in"
      : "Print station: off — tap to make this device the print station";

  const handleToggle = () => {
    const next = !isStation;
    setStation(next);
    toast.success(
      next
        ? lang === "vi"
          ? "Đã bật Trạm quầy trên máy này — sẽ tự in & báo đơn mới"
          : "Print station enabled on this device"
        : lang === "vi"
          ? "Đã tắt Trạm quầy trên máy này"
          : "Print station disabled on this device"
    );
  };

  return (
    <Button
      variant={isStation ? "default" : "ghost"}
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={isStation}
      onClick={handleToggle}
      className="relative"
    >
      <Printer className="h-4 w-4" />
      {isStation && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-background" />
      )}
    </Button>
  );
}
