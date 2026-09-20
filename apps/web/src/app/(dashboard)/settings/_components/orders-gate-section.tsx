"use client";

import { useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchSettings } from "@/hooks/use-settings";
import { SettingSection, SettingRow } from "@/components/settings/setting-row";

/**
 * Mã mở khoá tab Đơn hàng.
 *
 * ⚠️ Có nút Lưu RIÊNG, không đi chung `SettingsSaveBar` của trang: mã lưu qua
 * đường riêng `PUT /api/settings/orders-gate` với quyền `org:update` (chỉ chủ
 * quán), khác hẳn `PATCH /settings/branch` mà quản lý chi nhánh cũng dùng được.
 * Gộp chung nút Lưu là mã rơi vào đường quyền thấp hơn.
 *
 * Máy chủ không bao giờ trả mã về đây — chỉ có cờ `code_set`.
 */
export function OrdersGateSection() {
  const { user } = useAuthStore();
  const { data: branch, refetch } = useBranchSettings();
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Chỉ chủ quán thấy khối này; máy chủ cũng chặn bằng `org:update`, hai bên
  // phải khớp nhau.
  if (!user || !["super_admin", "org_admin"].includes(user.role)) return null;

  const isSet = Boolean((branch as any)?.settings?.orders_gate?.code_set);

  const save = async (nextCode: string) => {
    setSaving(true);
    try {
      await apiFetch("/api/settings/orders-gate", {
        method: "PUT",
        body: JSON.stringify({ code: nextCode }),
      });
      setCode("");
      await refetch();
      toast.success(nextCode ? "Đã đặt mã mở khoá" : "Đã bỏ khoá tab Đơn hàng");
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingSection
      title="Khoá tab Đơn hàng"
      description="Đặt mã thì nhân viên phải nhập mới xem được đơn cũ (cả tab Đơn hàng lẫn nút Lịch sử trên thẻ bàn). Quản lý trở lên không cần nhập."
    >
      <SettingRow
        label="Mã mở khoá"
        help={
          isSet
            ? "Đang khoá. Gõ mã mới để đổi, hoặc bấm Bỏ khoá để mở cho mọi người."
            : "Chưa khoá — ai cũng xem được đơn cũ. Đặt mã từ 4 ký tự trở lên."
        }
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder={isSet ? "Gõ mã mới để đổi" : "Đặt mã"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="shrink-0"
              disabled={saving || code.trim().length < 4}
              onClick={() => save(code.trim())}
            >
              {saving ? "Đang lưu…" : isSet ? "Đổi mã" : "Đặt mã"}
            </Button>
            {isSet && (
              <Button
                variant="outline"
                className="shrink-0 text-destructive"
                disabled={saving}
                onClick={() => save("")}
              >
                Bỏ khoá
              </Button>
            )}
          </div>
        </div>
      </SettingRow>
    </SettingSection>
  );
}
