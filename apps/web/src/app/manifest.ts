import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TODA POS",
    short_name: "TODA POS",
    description: "Hệ thống POS cho quán cà phê — order, bếp/pha chế và thanh toán",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Nâu espresso — khớp nền biểu tượng. Đây cũng là màu MÀN HÌNH CHỜ lúc mở PWA,
    // lệch màu là hở một vệt quanh biểu tượng.
    background_color: "#2e211a",
    theme_color: "#2e211a",
    lang: "vi",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android tự bo/cắt viền — bản này chừa sẵn vùng an toàn quanh logo.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
