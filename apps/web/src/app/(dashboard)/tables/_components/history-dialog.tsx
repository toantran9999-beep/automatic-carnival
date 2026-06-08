"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Label } from "@restai/ui/components/label";
import { DatePicker } from "@restai/ui/components/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { Clock, DollarSign, ShoppingCart } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useTableHistory } from "@/hooks/use-tables";
import { useTranslation } from "@/stores/lang-store";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-muted rounded", className)} />;
}

interface HistoryDialogProps {
  table: any | null;
  onClose: () => void;
}

export function HistoryDialog({ table, onClose }: HistoryDialogProps) {
  const { t, lang } = useTranslation();
  const [historyFrom, setHistoryFrom] = useState<string | undefined>();
  const [historyTo, setHistoryTo] = useState<string | undefined>();
  const { data: historyData, isLoading: historyLoading } = useTableHistory(table?.id, historyFrom, historyTo);

  return (
    <Dialog open={!!table} onOpenChange={(open) => { if (!open) { setHistoryFrom(undefined); setHistoryTo(undefined); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("tables.history")} - {t("tables.title")} {table?.number}
          </DialogTitle>
          <DialogDescription>
            {lang === "vi" ? "Lịch sử phiên hoạt động, đơn hàng và doanh thu" : "Past sessions, orders, and revenue"}
          </DialogDescription>
        </DialogHeader>
        {table && (
          <div className="space-y-4">
            {/* Date range filter */}
            <div className="flex gap-3 items-end">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">{t("reports.from")}</Label>
                <DatePicker
                  value={historyFrom}
                  onChange={setHistoryFrom}
                  placeholder={t("reports.from")}
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs">{t("reports.to")}</Label>
                <DatePicker
                  value={historyTo}
                  onChange={setHistoryTo}
                  placeholder={t("reports.to")}
                />
              </div>
              {(historyFrom || historyTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setHistoryFrom(undefined); setHistoryTo(undefined); }}>
                  {t("pos.clear")}
                </Button>
              )}
            </div>

            {/* Summary */}
            {historyData && (
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <DollarSign className="h-4 w-4 mx-auto mb-1 text-green-600" />
                    <p className="text-lg font-bold">{formatCurrency(historyData.summary.total_revenue)}</p>
                    <p className="text-xs text-muted-foreground">{t("reports.revenue")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <ShoppingCart className="h-4 w-4 mx-auto mb-1 text-blue-600" />
                    <p className="text-lg font-bold">{historyData.summary.total_orders}</p>
                    <p className="text-xs text-muted-foreground">{t("nav.orders")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <Clock className="h-4 w-4 mx-auto mb-1 text-orange-600" />
                    <p className="text-lg font-bold">{historyData.summary.avg_duration_minutes} min</p>
                    <p className="text-xs text-muted-foreground">
                      {lang === "vi" ? "Thời gian trung bình" : "Avg duration"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sessions list */}
            {historyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : historyData?.sessions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {lang === "vi" ? "Không có lịch sử phiên nào cho bàn này" : "No sessions recorded for this table"}
              </p>
            ) : (
              <div className="space-y-2">
                {historyData?.sessions.map((session: any) => (
                  <Card key={session.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{session.customer_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {session.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(session.started_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {session.duration_minutes !== null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {session.duration_minutes} min
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          {session.order_count} {t("nav.orders").toLowerCase()}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {formatCurrency(session.total_revenue)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
