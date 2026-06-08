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
    background_color: "#1c1917",
    theme_color: "#1c1917",
    lang: "vi",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
