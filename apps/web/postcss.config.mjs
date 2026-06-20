/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Hạ cấp CSS hiện đại cho WebView máy POS cũ (~Chromium 83):
    "@csstools/postcss-cascade-layers": {}, // dàn phẳng @layer (Chrome 99)
    "@restai/postcss-compat": {}, // đổi color-mix() (Chrome 111) sang màu đặc
  },
};

export default config;
