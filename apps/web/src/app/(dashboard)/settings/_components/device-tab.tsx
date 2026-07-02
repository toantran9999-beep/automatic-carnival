"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStationStore } from "@/stores/station-store";
import { useTranslation } from "@/stores/lang-store";

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

/**
 * Cài đặt THEO THIẾT BỊ (lưu trên chính máy này — localStorage), không phải
 * cài đặt chi nhánh. Bật "Trạm quầy" trên đúng máy POS có gắn máy in.
 */
export function DeviceTab() {
  const { lang } = useTranslation();
  const isStation = useStationStore((s) => s.isStation);
  const soundEnabled = useStationStore((s) => s.soundEnabled);
  const setStation = useStationStore((s) => s.setStation);
  const setSound = useStationStore((s) => s.setSound);

  // Tránh lệch SSR/CSR vì giá trị nằm ở localStorage.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const vi = lang === "vi";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          {vi ? "Trạm in tại quầy (thiết bị này)" : "Print station (this device)"}
        </CardTitle>
        <CardDescription>
          {vi
            ? "Bật trên ĐÚNG máy POS ở quầy có gắn máy in. Khi bật, máy này sẽ tự in phiếu bếp + kêu chuông mỗi khi có đơn mới (kể cả đơn nhân viên đặt từ điện thoại). Cài đặt này lưu riêng trên từng máy."
            : "Turn on only on the counter POS that has the printer. When on, this device auto-prints the kitchen ticket and rings on every new order (including orders sent from staff phones). This setting is saved per device."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="pr-4">
            <p className="text-sm font-medium">
              {vi ? "Máy này là Trạm quầy" : "This device is the print station"}
            </p>
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Tự in phiếu bếp + báo đơn mới khi có đơn từ điện thoại/khác."
                : "Auto-print kitchen tickets and announce new orders."}
            </p>
          </div>
          <Toggle
            checked={mounted && isStation}
            onChange={() => setStation(!isStation)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="pr-4">
            <p className="text-sm font-medium">
              {vi ? "Chuông báo đơn mới" : "New-order sound"}
            </p>
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Phát tiếng 'ting' khi có đơn mới (chỉ khi máy này là Trạm quầy)."
                : "Play a chime on new orders (only when this device is the station)."}
            </p>
          </div>
          <Toggle
            checked={mounted && soundEnabled}
            onChange={() => setSound(!soundEnabled)}
            disabled={mounted && !isStation}
          />
        </div>

        {mounted && (
          <div className="rounded-lg border p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">
              {vi ? "Thông tin trình duyệt máy này" : "This device's browser"}
            </p>
            <p>
              {(() => {
                const m = navigator.userAgent.match(/Chrome\/(\d+[\d.]*)/);
                return m
                  ? `Chromium ${m[1]}${
                      parseInt(m[1], 10) < 100
                        ? vi
                          ? " (WebView cũ — đang chạy chế độ tương thích)"
                          : " (old WebView — compatibility mode active)"
                        : ""
                    }`
                  : vi
                    ? "Không phải nhân Chromium"
                    : "Not Chromium-based";
              })()}
            </p>
            <p className="break-all opacity-70">{navigator.userAgent}</p>
          </div>
        )}

        {mounted && isStation && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">
              {vi ? "Để in tự động không hiện hộp thoại A4:" : "For seamless auto-print (no A4 dialog):"}
            </p>
            <p>
              {vi
                ? "Vào tab Chi nhánh → \"Trình điều khiển in\" chọn RawBT/ESC-POS, và cài app RawBT trên máy này với máy in USB."
                : "Go to the Branch tab → \"Print driver\" and choose RawBT/ESC-POS, then install RawBT on this device with the USB printer."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
