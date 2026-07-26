"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TableCard } from "./table-card";

interface TableServiceRequestIndicator {
  type: "request_bill" | "call_waiter";
  customerName: string;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-muted/50 p-4 flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <div className="h-10 w-12 bg-muted rounded" />
        <div className="h-5 w-14 bg-muted rounded-full" />
      </div>
      <div className="h-3 w-20 bg-muted rounded" />
      <div className="flex gap-1 mt-auto">
        <div className="h-7 w-7 bg-muted rounded-lg" />
        <div className="h-7 w-7 bg-muted rounded-lg" />
        <div className="h-7 w-7 bg-muted rounded-lg" />
      </div>
      <div className="h-7 w-full bg-muted rounded-lg" />
    </div>
  );
}

interface GridViewProps {
  tables: any[];
  isLoading: boolean;
  canManage?: boolean;
  /** false = chỉ xem dữ liệu đang bán hàng (quản lý/admin). Xem `canTouchLiveOps`. */
  canOperate?: boolean;
  hideQr?: boolean;
  waiterAssignmentEnabled: boolean;
  statusChangePending: boolean;
  requestByTableId: Record<string, TableServiceRequestIndicator>;
  onQr: (table: any) => void;
  onHistory: (table: any) => void;
  onAssign: (table: any) => void;
  onDelete: (table: any) => void;
  onOperations?: (table: any) => void;
  onStatusChange: (tableId: string, status: string) => void;
  onCardClick?: (table: any) => void;
  onPay?: (table: any) => void;
  onVoid?: (table: any) => void;
}

export function GridView({
  tables,
  isLoading,
  canManage,
  canOperate = true,
  hideQr,
  waiterAssignmentEnabled,
  statusChangePending,
  requestByTableId,
  onQr,
  onHistory,
  onAssign,
  onDelete,
  onOperations,
  onStatusChange,
  onCardClick,
  onPay,
  onVoid,
}: GridViewProps) {
  // 1 đồng hồ chung cho mọi card (hiện thời gian ngồi), tick mỗi 30s
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    // auto-rows-fr: kéo MỌI hàng bằng hàng cao nhất. Không có nó thì chiều cao mỗi hàng
    // tự co theo thẻ cao nhất trong hàng đó → hàng có bàn khách cao, hàng toàn bàn trống
    // thấp, cùng là "bàn trống" mà cao thấp khác nhau tuỳ nằm hàng nào.
    <div className="grid auto-rows-fr gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 mt-4">
      {isLoading
        ? Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} />
          ))
        : tables.map((table: any) => (
            <TableCard
              key={table.id}
              table={table}
              now={now}
              canManage={canManage}
              canOperate={canOperate}
              hideQr={hideQr}
              waiterAssignmentEnabled={waiterAssignmentEnabled}
              statusChangePending={statusChangePending}
              serviceRequest={requestByTableId[table.id]}
              onQr={onQr}
              onHistory={onHistory}
              onAssign={onAssign}
              onDelete={onDelete}
              onOperations={onOperations}
              onStatusChange={onStatusChange}
              onCardClick={onCardClick}
              onPay={onPay}
              onVoid={onVoid}
            />
          ))}
    </div>
  );
}
