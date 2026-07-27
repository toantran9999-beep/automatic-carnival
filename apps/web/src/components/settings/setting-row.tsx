"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Khuôn chung cho MỌI trang cài đặt.
 *
 * Lý do có file này: trước đây thêm một cài đặt mới = chép thêm 25 dòng bố cục vào
 * một file 407 dòng. Không có khuôn nên mỗi khối một dáng — đó chính là cái làm
 * trang Cài đặt trông chắp vá. Từ nay khai báo, không vẽ lại:
 *
 *   <SettingSection title="In ấn" description="…">
 *     <SettingRow label="Kiểu in" help="…">
 *       <Select … />
 *     </SettingRow>
 *   </SettingSection>
 */

export function SettingSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </header>
      {/* divide-y: mỗi hàng tự có đường kẻ ngăn, không phải tự thêm border từng chỗ. */}
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  help,
  htmlFor,
  children,
  /** Điều khiển rộng (ô nhập, danh sách chọn) thì xuống dòng riêng cho dễ bấm. */
  stacked = false,
  className,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: ReactNode;
  stacked?: boolean;
  className?: string;
}) {
  if (stacked) {
    return (
      <div className={cn("space-y-2 px-4 py-3.5", className)}>
        <div>
          <SettingLabel htmlFor={htmlFor}>{label}</SettingLabel>
          {help && <SettingHelp>{help}</SettingHelp>}
        </div>
        {children}
      </div>
    );
  }

  return (
    // ⚠️ min-w-0 cho phần chữ + shrink-0 cho điều khiển: chữ co lại trước, điều
    // khiển KHÔNG BAO GIỜ bị đẩy ra ngoài khung. Đúng bài học đã trả giá ở màn
    // thanh toán POS (nút bị cắt cụt mà im lặng, không ai biết đang thiếu).
    <div className={cn("flex items-center justify-between gap-4 px-4 py-3.5", className)}>
      <div className="min-w-0">
        <SettingLabel htmlFor={htmlFor}>{label}</SettingLabel>
        {help && <SettingHelp>{help}</SettingHelp>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  const cls = "block text-sm font-medium text-foreground";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>
      {children}
    </label>
  ) : (
    <p className={cls}>{children}</p>
  );
}

function SettingHelp({ children }: { children: ReactNode }) {
  // leading-snug + KHÔNG truncate: thà xuống dòng còn hơn cắt mất chữ giải thích.
  return <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{children}</p>;
}

/**
 * Thanh Lưu của từng trang con. Mỗi trang tự lưu phần của mình — không còn một
 * nút Lưu ở tận đáy gánh cả 407 dòng như trước.
 */
export function SettingsSaveBar({
  onSave,
  saving,
  savingLabel,
  saveLabel,
  disabled,
}: {
  onSave: () => void;
  saving: boolean;
  savingLabel: string;
  saveLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground",
          "transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        {saving ? savingLabel : saveLabel}
      </button>
    </div>
  );
}
