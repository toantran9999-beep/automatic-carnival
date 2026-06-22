/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Hạ cấp CSS hiện đại cho WebView máy POS cũ (~Chromium 83):
    // gỡ vỏ @layer (Chrome 99) + đổi color-mix() (Chrome 111) sang màu đặc.
    "@restai/postcss-compat": {},
  },
};

export default config;
