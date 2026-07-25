"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState } from "react";
import {
  CACHE_MAX_AGE,
  CACHE_STORAGE_KEY,
  CACHE_VERSION,
  isPersistedQueryKey,
} from "@/lib/query-config";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Giữ dữ liệu trong bộ nhớ 24 giờ. Mặc định của thư viện là 5 PHÚT — vắng
            // khách quá 5 phút là thực đơn bị vứt, bấm vô bàn phải tải lại từ đầu và
            // màn Bán hàng hiện vòng xoay. Giữ lâu thì lưới món vẽ ngay, dữ liệu mới
            // về sau đó thay êm ở dưới (stale-while-revalidate).
            gcTime: 24 * 60 * 60_000,
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      })
  );

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: CACHE_STORAGE_KEY,
    })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: CACHE_VERSION,
        dehydrateOptions: {
          // Chỉ ghi xuống máy nhóm thực đơn — xem chú thích ở query-config.ts.
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && isPersistedQueryKey(query.queryKey),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
