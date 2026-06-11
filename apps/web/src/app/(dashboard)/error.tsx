"use client";

import { Button } from "@restai/ui/components/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-xl font-semibold">Lỗi bảng điều khiển</h2>
      <p className="text-muted-foreground">
        {error.message || "Đã xảy ra lỗi không mong muốn"}
      </p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
