"use client";

import { Button } from "@restai/ui/components/button";
import { SearchInput } from "@/components/search-input";
import { useTranslation } from "@/stores/lang-store";

interface OrderFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}

export function OrderFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: OrderFiltersProps) {
  const { t } = useTranslation();

  return (
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
  );
}
