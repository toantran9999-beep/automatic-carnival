import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Toaster } from "sonner";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TODA POS",
  description: "He thong POS nha hang cho van hanh, bep va thanh toan",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TODA POS",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('toda_theme')||'dark';var a=localStorage.getItem('toda_accent')||'#7aa653';var e=document.documentElement;e.classList.add(t);e.style.setProperty('--accent-runtime',a);}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className={beVietnamPro.className}>
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
