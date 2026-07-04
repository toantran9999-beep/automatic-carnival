/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // @restai/postcss-compat (hạ cấp CSS cho WebView ~Chromium 83) đã gỡ:
    // toàn bộ máy POS đã lên WebView hiện đại (~Chromium 149). Xem ARCHITECTURE.md §7.
  },
};

export default config;
