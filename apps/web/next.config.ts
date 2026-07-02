import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: false,
  transpilePackages: ["@restai/ui", "@restai/validators", "@restai/types", "@restai/config"],
  // VPS build (2GB RAM) không đủ để chạy lại type-check bên trong `next build`
  // (jest-worker riêng cho bước này từng ngốn ~950MB, làm swap đầy 100% và
  // treo build). AGENTS.md đã bắt buộc `bunx tsc --noEmit` LOCAL trước mỗi
  // commit — đây là cổng kiểm tra chính, không đổi. Cờ này chỉ tắt bước
  // type-check TRÙNG LẶP bên trong build production trên VPS yếu.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
