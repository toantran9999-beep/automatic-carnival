"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import {
  DollarSign,
  ClipboardList,
  ShoppingBag,
  Grid3X3,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useTranslation } from "@/stores/lang-store";
import type { Overview } from "@/hooks/use-dashboard";
import { OpenTablesDialog } from "./open-tables-dialog";
import { OpenTakeawayDialog } from "./open-takeaway-dialog";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

function DeltaBadge({ pct }: { pct: number | null }) {
  const { t } = useTranslation();
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? "+" : ""}
      {pct}% <span className="text-muted-foreground font-normal">{t("dashboard.vsYesterday")}</span>
    </span>
  );
}

interface KpiCardsProps {
  data?: Overview;
  isLoading: boolean;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  const { t } = useTranslation();
  const [tablesOpen, setTablesOpen] = useState(false);
  const [takeawayOpen, setTakeawayOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-2 h-7 w-24" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { today, deltas } = data;

  /**
   * ⚠️ Trước đây có thêm một thẻ "TB/đơn" riêng — mà TB/đơn ĐÃ nằm ở dòng chân
   * thẻ Doanh thu, còn dòng chân của nó ("Đơn hủy hôm nay") thì ĐÃ có ở thẻ Cơ
   * cấu đơn phía dưới. Tức là thẻ đó chiếm 1/4 hàng thẻ quan trọng nhất trang mà
   * không nói thêm được gì mới. Đã bỏ, nhường chỗ cho Mang về đang mở.
   *
   * Hai thẻ cuối cùng một dạng: "việc chưa xong + tiền chưa thu".
   */
  const cards = [
    {
      title: t("dashboard.revenueToday"),
      value: formatCurrency(today.revenue),
      icon: DollarSign,
      delta: deltas.revenuePct,
      foot: `${t("dashboard.avgOrder")}: ${formatCurrency(today.averageOrderValue)}`,
    },
    {
      title: t("dashboard.ordersToday"),
      value: String(today.orders),
      icon: ClipboardList,
      delta: deltas.ordersPct,
      foot: `${t("dashboard.activeOrders")}: ${today.activeOrders}`,
    },
    {
      title: t("dashboard.openTakeaway", "Mang về đang mở"),
      value: String(today.openTakeawayOrders),
      icon: ShoppingBag,
      delta: null as number | null,
      // Tiền của đơn mang về chưa thu. KHÔNG chồng lấn số ở thẻ bàn bên cạnh —
      // bên đó chỉ tính đơn gắn phiên bàn.
      foot: `${t("dashboard.openTablesRevenue")}: ${formatCurrency(today.openTakeawayRevenue)}`,
      onClick: () => setTakeawayOpen(true),
    },
    {
      title: t("dashboard.occupiedTables"),
      value: `${today.occupiedTables}/${today.totalTables}`,
      icon: Grid3X3,
      delta: null as number | null,
      // Tiền đang treo ở các bàn còn khách. KHÔNG phải doanh thu — chưa thu đồng nào,
      // nên nhãn phải nói rõ "đang chờ thanh toán" kẻo cộng nhầm vào doanh thu ngày.
      foot: `${t("dashboard.openTablesRevenue")}: ${formatCurrency(today.openTablesRevenue)}`,
      onClick: () => setTablesOpen(true),
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const clickable = !!card.onClick;
          const body = (
            <>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tabular-nums sm:text-2xl">{card.value}</div>
                {/* ⚠️ KHÔNG dùng `truncate` ở dòng chân: trên điện thoại lưới 2 cột, thẻ
                    chỉ rộng ~150px nên cắt cụt là nuốt luôn CON SỐ ở cuối câu
                    ("Đang chờ thanh to..."). Cho xuống dòng — thà cao thêm một dòng
                    còn hơn mất số tiền. */}
                <div className="mt-1 min-h-[1rem]">
                  {card.delta !== null ? (
                    <DeltaBadge pct={card.delta} />
                  ) : (
                    <p className="text-xs leading-snug text-muted-foreground">{card.foot}</p>
                  )}
                </div>
                {card.delta !== null && card.foot && (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{card.foot}</p>
                )}
                {clickable && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {t("dashboard.seeDetail", "Xem chi tiết")}
                  </p>
                )}
              </CardContent>
            </>
          );

          // Thẻ bấm được phải là <button> thật, không phải <div onClick>: có mới
          // bấm được bằng bàn phím và trình đọc màn hình mới đọc ra là nút.
          return clickable ? (
            <Card key={card.title} className="p-0">
              <button
                type="button"
                onClick={card.onClick}
                className="flex h-full w-full flex-col text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
              >
                {body}
              </button>
            </Card>
          ) : (
            <Card key={card.title}>{body}</Card>
          );
        })}
      </div>

      <OpenTablesDialog open={tablesOpen} onOpenChange={setTablesOpen} />
      <OpenTakeawayDialog open={takeawayOpen} onOpenChange={setTakeawayOpen} />
    </>
  );
}
