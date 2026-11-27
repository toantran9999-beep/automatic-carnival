"use client";

import { Button } from "@restai/ui/components/button";
import { DatePicker } from "@restai/ui/components/date-picker";
import { SearchInput } from "@/components/search-input";
import { useTranslation } from "@/stores/lang-store";
import { addDays, vnMonthStart, vnToday } from "@/lib/vn-date";

export interface DateRange {
  start: string;
  end: string;
}

interface OrderFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  /** null = mọi ngày. */
  dateRange: DateRange | null;
  onDateRangeChange: (range: DateRange | null) => void;
}

/** Các khoảng chọn nhanh — tính lại mỗi lần vẽ để qua nửa đêm vẫn đúng "hôm nay". */
function datePresets(): { key: string; label: string; range: DateRange | null }[] {
  const today = vnToday();
  const yesterday = addDays(today, -1);
  return [
    { key: "all", label: "Mọi ngày", range: null },
    { key: "today", label: "Hôm nay", range: { start: today, end: today } },
    { key: "yesterday", label: "Hôm qua", range: { start: yesterday, end: yesterday } },
    { key: "7d", label: "7 ngày", range: { start: addDays(today, -6), end: today } },
    { key: "month", label: "Tháng này", range: { start: vnMonthStart(), end: today } },
  ];
}

export function OrderFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  dateRange,
  onDateRangeChange,
}: OrderFiltersProps) {
  const { t } = useTranslation();
  const presets = datePresets();
  const activePreset = presets.find((p) =>
    p.range === null
      ? dateRange === null
      : dateRange?.start === p.range.start && dateRange?.end === p.range.end,
  )?.key;

  // Chọn một đầu thì đầu kia tự theo, khỏi bắt chọn đủ hai ô mới lọc được.
  // Hai đầu ngược nhau thì kéo đầu kia về cùng ngày, không để ra danh sách rỗng khó hiểu.
  const setStart = (d: string | undefined) => {
    if (!d) return onDateRangeChange(dateRange?.end ? { start: dateRange.end, end: dateRange.end } : null);
    const end = dateRange?.end && dateRange.end >= d ? dateRange.end : d;
    onDateRangeChange({ start: d, end });
  };
  const setEnd = (d: string | undefined) => {
    if (!d) return onDateRangeChange(dateRange?.start ? { start: dateRange.start, end: dateRange.start } : null);
    const start = dateRange?.start && dateRange.start <= d ? dateRange.start : d;
    onDateRangeChange({ start, end: d });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t("orders.searchPlaceholderStaff")}
          className="flex-1"
        />
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "confirmed", "preparing", "ready", "served", "completed"].map(
            (status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => onStatusFilterChange(status)}
              >
                {status === "all"
                  ? t("orders.all")
                  : t("orders.status_" + status)}
              </Button>
            )
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <Button
              key={p.key}
              variant={activePreset === p.key ? "default" : "outline"}
              size="sm"
              onClick={() => onDateRangeChange(p.range)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:w-[440px]">
          <DatePicker
            value={dateRange?.start ?? ""}
            onChange={setStart}
            placeholder="Từ ngày"
            className="w-full"
          />
          <DatePicker
            value={dateRange?.end ?? ""}
            onChange={setEnd}
            placeholder="Đến ngày"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
