"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Store, Printer, MonitorCog, Map as MapIcon, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useTranslation } from "@/stores/lang-store";
import { cn } from "@/lib/utils";

/**
 * Khung chung cho Cài đặt.
 *
 * Trước đây cả 5 mục nhét trong MỘT trang, chuyển mục bằng `useState` — tải lại
 * trang là mất chỗ đang xem, không gửi link cho ai được. Giờ mỗi mục là một
 * đường dẫn thật.
 *
 * Các mục chia theo VIỆC chứ không theo bảng dữ liệu. Đáng chú ý: "In ấn" gom cả
 * ba chỗ cấu hình in vốn nằm rải ở tab Chi nhánh / Hóa đơn / Thiết bị.
 *
 * Dùng thẻ liên kết chứ KHÔNG dùng `Tabs` của Radix: đây là điều hướng giữa các
 * trang thật, không phải đổi khung nội dung. Kiểu dáng vẫn chép đúng lớp CSS của
 * `TabsList`/`TabsTrigger` để nhìn giống hệt các trang khác.
 */

const SECTIONS = [
  { href: "/settings/shop", icon: Building2, key: "settings.tabShop", fallback: "Quán" },
  { href: "/settings/branches", icon: Store, key: "settings.tabBranches", fallback: "Chi nhánh" },
  { href: "/settings/printing", icon: Printer, key: "settings.tabPrinting", fallback: "In ấn" },
  { href: "/settings/pos", icon: MonitorCog, key: "settings.tabPos", fallback: "Màn bán hàng" },
  { href: "/settings/floor", icon: MapIcon, key: "settings.tabFloor", fallback: "Sơ đồ bàn" },
  { href: "/settings/device", icon: Smartphone, key: "settings.tabDevice", fallback: "Thiết bị này" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Kéo mục đang chọn vào giữa tầm nhìn.
  // ⚠️ TUYỆT ĐỐI không dùng `scrollIntoView`: nó cuộn MỌI khung cha, mà `<main>`
  // của bảng điều khiển là khung cuộn ngang → sẽ đẩy lệch NGANG cả trang, tiêu đề
  // và logo bị cắt cụt bên trái. Đã mắc đúng lỗi này ở trang Bàn ăn. Đặt thẳng
  // `scrollLeft` thì không lan ra cha.
  useEffect(() => {
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-section="${pathname}"]`);
    if (!box || !el) return;
    box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, [pathname]);

  return (
    <div className="space-y-5">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex items-center overflow-x-auto pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <nav className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
            {SECTIONS.map(({ href, icon: Icon, key, fallback }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  data-section={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium ring-offset-background transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    active && "bg-background text-foreground shadow",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(key, fallback)}
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Vệt mờ mép phải: báo còn mục nữa bên phải, vì thanh cuộn đã ẩn. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent" />
      </div>

      {children}
    </div>
  );
}
