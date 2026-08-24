"use client";

import * as React from "react";
import { MoreVertical } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@restai/ui/components/popover";
import { cn } from "@/lib/utils";

export interface ActionItem {
  key: string;
  label: string;
  icon: React.ElementType;
  onSelect: () => void;
  /** Mục nguy hiểm (Xóa) — chữ đỏ, tách khỏi nhóm trên bằng đường kẻ */
  destructive?: boolean;
  disabled?: boolean;
  /** Nội dung tự dựng thay cho nút mặc định (vd: nút tải ảnh) */
  render?: (close: () => void) => React.ReactNode;
}

interface ActionsMenuProps {
  items: ActionItem[];
  label: string;
  /** Lớp CSS cho nút ⋮ — dùng để đổi màu khi đặt trên nền ảnh hoặc nền primary */
  triggerClassName?: string;
  align?: "start" | "center" | "end";
}

/**
 * Menu thao tác dạng nút ⋮ LUÔN HIỆN (thay cho kiểu chỉ hiện khi rê chuột).
 * Điện thoại không rê chuột được nên mọi thao tác Sửa/Ẩn/Xóa phải bấm thẳng được.
 * Dựng trên Popover có sẵn (dự án chưa có DropdownMenu).
 *
 * Dùng chung cho trang Thực đơn và thẻ bàn ở trang Bàn ăn. Ở thẻ bàn nó thay
 * cho hàng 5 nút icon 28×28 cũ: thẻ chỉ rộng ~166px nên nhồi 5 nút đủ chuẩn
 * 44px (=220px) là tràn — gom vào một nút thì vừa đủ to, vừa có CHỮ đi kèm.
 */
export function ActionsMenu({ items, label, triggerClassName, align = "end" }: ActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-52 p-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col">
          {items.map((item, i) => {
            const prevDestructive = i > 0 && items[i - 1].destructive;
            const needsDivider = item.destructive && !prevDestructive && i > 0;
            if (item.render) {
              return (
                <div key={item.key} className={cn(needsDivider && "mt-1 border-t pt-1")}>
                  {item.render(close)}
                </div>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
                  item.destructive ? "text-destructive hover:bg-destructive/10" : "text-foreground",
                  needsDivider && "mt-1 border-t pt-2.5",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
