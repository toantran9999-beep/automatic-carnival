// PostCSS plugin: hạ cấp color-mix() cho WebView cũ (~Chromium 83, thiếu
// color-mix cần Chrome 111). Đổi mỗi color-mix(in <space>, COLOR p%, ...)
// thành MÀU ĐẦU TIÊN (đặc) — bỏ phần trộn/độ mờ. Không pixel-perfect nhưng
// mọi màu hiển thị được thay vì bị bỏ qua (mất nền/chữ dính).

function splitTopLevel(s, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

function firstColorOf(args) {
  const parts = splitTopLevel(args, ",").map((p) => p.trim());
  // parts[0] = không gian màu (vd "in oklab"); màu đầu tiên = parts[1]
  let c = (parts[1] || parts[0] || "").trim();
  // bỏ phần trăm tỉ lệ trộn ở cuối: "var(--x) 50%" -> "var(--x)"
  c = c.replace(/\s+[\d.]+%\s*$/, "").trim();
  return c || "transparent";
}

function replaceColorMix(value) {
  let out = "";
  let i = 0;
  while (true) {
    const idx = value.indexOf("color-mix(", i);
    if (idx === -1) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, idx);
    let k = idx + "color-mix".length; // trỏ tới '('
    let depth = 0;
    const argStart = k + 1;
    for (; k < value.length; k++) {
      if (value[k] === "(") depth++;
      else if (value[k] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const inner = value.slice(argStart, k);
    out += firstColorOf(replaceColorMix(inner)); // xử lý lồng nhau
    i = k + 1;
  }
  return out;
}

export default function compat() {
  return {
    postcssPlugin: "toda-css-compat",
    OnceExit(root) {
      // 1) Dàn phẳng @layer cho WebView cũ (Chromium <99 bỏ qua cả khối @layer
      //    → mất sạch style). Tailwind v4 phát các lớp theo ĐÚNG thứ tự ưu tiên
      //    (theme → base → components → utilities), nên chỉ cần GỠ VỎ @layer
      //    (giữ nguyên thứ tự, KHÔNG đụng specificity) — tránh tác dụng phụ của
      //    polyfill cascade-layers làm vài utility (max-height, gap...) thua
      //    specificity → vỡ layout (dialog tràn, chữ dính).
      root.walkAtRules("layer", (at) => {
        if (at.nodes && at.nodes.length) at.replaceWith(at.nodes);
        else at.remove(); // câu "@layer a,b,c;" (chỉ khai báo thứ tự)
      });

      // 2) Đổi color-mix() (Chrome 111) sang màu đặc.
      root.walkDecls((decl) => {
        if (decl.value && decl.value.indexOf("color-mix(") !== -1) {
          decl.value = replaceColorMix(decl.value);
        }
      });
    },
  };
}
compat.postcss = true;
