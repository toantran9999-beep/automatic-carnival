"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchSettings } from "@/hooks/use-settings";
import { useOrdersGateStore } from "@/stores/orders-gate-store";
import { isManagerRole } from "@/lib/roles";

/**
 * Cửa khoá mọi chỗ xem ĐƠN CŨ — phải nhập mã của chủ quán mới qua.
 *
 * ⚠️ Đây chỉ là CÁI CỬA, không phải cái khoá. Khoá thật nằm ở `requireOrdersGate`
 * phía máy chủ: `GET /api/orders` trả nguyên cục dữ liệu đơn, nên giấu ở giao
 * diện là vô nghĩa — mở tab Network hoặc gỡ vài dòng trong DevTools là qua.
 * Đừng bao giờ coi component này là lớp bảo vệ.
 *
 * Vé lấy được chỉ nằm trong bộ nhớ (`orders-gate-store`) và máy chủ chỉ cấp 5
 * phút, nên rời trang hay để lâu là phải gõ lại — đúng ý chủ quán.
 */
export function OrdersGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { data: branch } = useBranchSettings();
  const ticket = useOrdersGateStore((s) => s.ticket);
  const setTicket = useOrdersGateStore((s) => s.setTicket);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Chủ quán chưa đặt mã = chưa khoá gì cả. Máy chủ cũng cho qua trong trường
  // hợp này — hai bên phải khớp, kẻo hiện ô nhập mã mà gõ gì cũng lọt.
  const isGated = Boolean((branch as any)?.settings?.orders_gate?.code_set);
  if (!isGated) return <>{children}</>;

  // Quản lý trở lên đi thẳng — máy chủ cũng miễn cho họ, hai bên phải khớp nhau.
  if (user && isManagerRole(user.role)) return <>{children}</>;
  if (ticket) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await apiFetch<{ ticket: string }>("/api/settings/orders-gate/verify", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setCode("");
      setTicket(res.ticket);
    } catch (err: any) {
      // Không nói gì thêm về mã (dài bao nhiêu, sai chỗ nào) — đó là gợi ý cho
      // người đang dò.
      setError(err?.message || "Mã không đúng.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </span>
          <h2 className="text-lg font-bold">Cần mã mở khoá</h2>
          <p className="text-sm leading-snug text-muted-foreground">
            Đơn hàng cũ chỉ xem được khi có mã của chủ quán. Hỏi chủ quán để lấy mã.
          </p>
        </div>

        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="Nhập mã"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          className="text-center text-lg tracking-widest"
        />

        {error && (
          <p role="alert" className="text-center text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="h-12 w-full text-base" disabled={!code.trim() || checking}>
          {checking ? "Đang kiểm…" : "Mở khoá"}
        </Button>

        <p className="text-center text-xs leading-snug text-muted-foreground">
          Mở khoá giữ 5 phút, rời trang là phải nhập lại.
        </p>
      </form>
    </div>
  );
}
