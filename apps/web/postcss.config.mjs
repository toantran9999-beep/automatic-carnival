/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Hạ cấp CSS hiện đại cho WebView máy POS cũ (~Chromium 83):
    // dàn phẳng @layer (cần Chrome 99) + đổi color-mix() tĩnh sang màu thường.
    "@csstools/postcss-cascade-layers": {},
    "@csstools/postcss-color-mix-function": { preserve: true },
  },
};

export default config;
