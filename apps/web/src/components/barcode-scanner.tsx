"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { beep } from "@/lib/beep";
import { useTranslation } from "@/stores/lang-store";

/**
 * Hộp thoại quét mã vạch / QR dùng chung cho nhập & xuất kho.
 *
 * Hai đường vào, cố ý:
 *  1. Camera điện thoại — dùng `BarcodeDetector` có sẵn trong Chrome Android nên
 *     không phải kéo thêm thư viện nào. ⚠️ Camera CHỈ chạy trên HTTPS (hoặc
 *     localhost); Caddy đã cấp Let's Encrypt nên bản thật ổn, nhưng mở bằng IP
 *     trần thì trình duyệt chặn thẳng — vì vậy phải luôn có đường 2.
 *  2. Ô gõ tay — máy quét cầm tay USB/Bluetooth hoạt động như bàn phím nên gõ
 *     thẳng vào ô này là xong, và cũng là lối thoát khi camera không lên.
 *
 * Quét xong KHÔNG tự đóng: quầy thường quét liên tiếp nhiều món, đóng ra mở vào
 * mỗi lần là chậm hơn gõ tay.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gọi mỗi lần đọc được một mã. Trả về false nếu muốn giữ nguyên trạng thái quét. */
  onScan: (code: string) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Chống đọc lặp: cùng một mã trong 1.5s chỉ tính một lần. */
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const supported =
    typeof window !== "undefined" && "BarcodeDetector" in window;

  const emit = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (lastRef.current.code === code && now - lastRef.current.at < 1500) return;
      lastRef.current = { code, at: now };
      beep();
      navigator.vibrate?.(40);
      onScan(code);
    },
    [onScan],
  );

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!supported) {
      setCameraError(t("inventory.scanNoDetector"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Camera sau — quét mã bằng camera trước là bất tiện thật sự.
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);

      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
      });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          if (found?.length) emit(found[0].rawValue);
        } catch {
          // Khung hình lỗi lẻ tẻ là bình thường — bỏ qua, đọc khung sau.
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setCameraError(
        (err as Error)?.name === "NotAllowedError"
          ? t("inventory.scanNoPermission")
          : t("inventory.scanNoCamera"),
      );
      stopCamera();
    }
  }, [supported, emit, stopCamera, t]);

  // Đóng hộp thoại là phải tắt camera. Để chạy ngầm thì đèn camera vẫn sáng và pin
  // điện thoại quầy tụt thấy rõ.
  useEffect(() => {
    if (!open) stopCamera();
    return () => stopCamera();
  }, [open, stopCamera]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{title ?? t("inventory.scanTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <Camera className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {cameraError ?? t("inventory.scanHint")}
                </p>
              </div>
            )}
          </div>

          <Button
            type="button"
            variant={cameraOn ? "outline" : "default"}
            className="w-full"
            onClick={() => (cameraOn ? stopCamera() : startCamera())}
          >
            {cameraOn ? (
              <>
                <CameraOff className="mr-2 h-4 w-4" />
                {t("inventory.scanStop")}
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                {t("inventory.scanStart")}
              </>
            )}
          </Button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              emit(manual);
              setManual("");
            }}
            className="space-y-2"
          >
            <Label htmlFor="manualCode" className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              {t("inventory.scanManual")}
            </Label>
            <div className="flex gap-2">
              <Input
                id="manualCode"
                // Máy quét cầm tay "gõ" rất nhanh rồi gửi Enter — autoFocus để nó rơi
                // đúng vào đây mà không phải bấm gì.
                autoFocus
                autoComplete="off"
                placeholder={t("inventory.scanManualPlaceholder")}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={!manual.trim()}>
                {t("common.confirm")}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
