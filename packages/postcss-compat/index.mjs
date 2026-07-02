// PostCSS plugin: hạ cấp CSS hiện đại (Tailwind v4 / shadcn) cho WebView cũ
// trên máy POS Android (~Chromium 83). Mỗi lớp xử 1 tính năng, kèm ngưỡng
// Chrome version cần có — thiếu lớp nào là tái phát lỗi trên máy thật:
//
//   A) @property (Chrome 85)            → đổ initial-value xuống *
//   B) @layer (Chrome 99)               → gỡ vỏ, giữ thứ tự nguồn
//   C) @supports test color-mix/oklch   → gỡ vỏ (đã convert bên trong)
//   D) @media range syntax (Chrome 104) → (width >= X) → (min-width: X)
//   E) :is()/:where() (Chrome 88)       → expand thành selector thường
//   F) oklch()/oklab() (Chrome 111)     → rgb()/rgba() tĩnh
//   G) color-mix() (Chrome 111)         → màu đầu tiên (đặc)
//   H) dvh/svh (Chrome 108)             → chèn fallback vh
//   I) logical shorthand (Chrome 87)    → padding-inline → left/right...
//   J) inset shorthand (Chrome 87)      → top/right/bottom/left
//   K) translate:/rotate:/scale: (104)  → gộp về transform: (kiểu TW v3)

// ---------- tiện ích parse ----------

function splitTopLevel(s, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
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

// Tách theo khoảng trắng ở depth 0 (giữ nguyên calc(...), var(...)).
function splitTopLevelSpace(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

// Tìm "name(" ở depth bất kỳ, trả [startIdx, argStart, endIdxCủaNgoặcĐóng] hoặc null.
function findFn(value, name, from = 0) {
  const idx = value.indexOf(name + "(", from);
  if (idx === -1) return null;
  let depth = 0;
  for (let k = idx + name.length; k < value.length; k++) {
    if (value[k] === "(") depth++;
    else if (value[k] === ")") {
      depth--;
      if (depth === 0) return [idx, idx + name.length + 1, k];
    }
  }
  return null;
}

// ---------- G) color-mix() → màu đầu tiên ----------

function firstColorOf(args) {
  const parts = splitTopLevel(args, ",").map((p) => p.trim());
  // parts[0] = không gian màu (vd "in oklab"); màu đầu tiên = parts[1]
  let c = (parts[1] || parts[0] || "").trim();
  c = c.replace(/\s+[\d.]+%\s*$/, "").trim(); // bỏ "var(--x) 50%" → "var(--x)"
  return c || "transparent";
}

function replaceColorMix(value) {
  let out = "";
  let i = 0;
  while (true) {
    const hit = findFn(value, "color-mix", i);
    if (!hit) {
      out += value.slice(i);
      break;
    }
    const [idx, argStart, end] = hit;
    out += value.slice(i, idx);
    out += firstColorOf(replaceColorMix(value.slice(argStart, end)));
    i = end + 1;
  }
  return out;
}

// ---------- F) oklch()/oklab() → rgb ----------

function gamma(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function oklabToRgbParts(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

function num(tok, percentBase) {
  if (tok == null) return null;
  tok = tok.trim();
  if (tok.endsWith("%")) {
    const n = parseFloat(tok);
    return Number.isNaN(n) ? null : (n / 100) * percentBase;
  }
  const n = parseFloat(tok);
  return Number.isNaN(n) ? null : n;
}

// args = phần trong ngoặc của oklch()/oklab(). Trả chuỗi rgb/rgba hoặc null nếu
// không convert tĩnh được (có var/calc/none) → giữ nguyên.
function convertOkColor(fn, args) {
  if (/var\(|calc\(|none/i.test(args)) return null;
  const [colorPart, alphaPart] = splitTopLevel(args, "/").map((p) => p && p.trim());
  const toks = splitTopLevelSpace(colorPart || "");
  if (toks.length !== 3) return null;
  const L = num(toks[0], 1);
  let a;
  let b;
  if (fn === "oklch") {
    const C = num(toks[1], 0.4);
    const H = num(toks[2], 360);
    if (L == null || C == null || H == null) return null;
    a = C * Math.cos((H * Math.PI) / 180);
    b = C * Math.sin((H * Math.PI) / 180);
  } else {
    a = num(toks[1], 0.4);
    b = num(toks[2], 0.4);
    if (L == null || a == null || b == null) return null;
  }
  const [r, g, bl] = oklabToRgbParts(L, a, b);
  const alpha = alphaPart != null ? num(alphaPart, 1) : 1;
  if (alpha == null) return null;
  if (alpha >= 1) return `rgb(${r}, ${g}, ${bl})`;
  return `rgba(${r}, ${g}, ${bl}, ${Math.max(0, Math.min(1, alpha))})`;
}

function replaceOkColors(value) {
  for (const fn of ["oklch", "oklab"]) {
    let i = 0;
    while (true) {
      const hit = findFn(value, fn, i);
      if (!hit) break;
      const [idx, argStart, end] = hit;
      const rgb = convertOkColor(fn, value.slice(argStart, end));
      if (rgb != null) {
        value = value.slice(0, idx) + rgb + value.slice(end + 1);
        i = idx + rgb.length;
      } else {
        i = end + 1;
      }
    }
  }
  return value;
}

// ---------- D) @media range syntax → min-/max- ----------

function downgradeMediaParams(params) {
  // (X <= width < Y) và các biến thể 2 vế
  let p = params.replace(
    /\(\s*([^()<>=\s]+(?:\([^()]*\))?)\s*(<=|<)\s*(width|height)\s*(<=|<)\s*([^()<>=\s]+(?:\([^()]*\))?)\s*\)/gi,
    (m, v1, op1, dim, op2, v2) => {
      const lo = op1 === "<=" ? v1 : `calc(${v1} + 0.02px)`;
      const hi = op2 === "<=" ? v2 : `calc(${v2} - 0.02px)`;
      return `(min-${dim}: ${lo}) and (max-${dim}: ${hi})`;
    },
  );
  // (width >= X) / (width > X) / (width <= X) / (width < X)
  p = p.replace(
    /\(\s*(width|height)\s*(>=|>|<=|<)\s*([^()<>=\s]+(?:\([^()]*\))?)\s*\)/gi,
    (m, dim, op, v) => {
      if (op === ">=") return `(min-${dim}: ${v})`;
      if (op === ">") return `(min-${dim}: calc(${v} + 0.02px))`;
      if (op === "<=") return `(max-${dim}: ${v})`;
      return `(max-${dim}: calc(${v} - 0.02px))`;
    },
  );
  // (X >= width) dạng đảo
  p = p.replace(
    /\(\s*([^()<>=\s]+(?:\([^()]*\))?)\s*(>=|>|<=|<)\s*(width|height)\s*\)/gi,
    (m, v, op, dim) => {
      if (op === ">=") return `(max-${dim}: ${v})`;
      if (op === ">") return `(max-${dim}: calc(${v} - 0.02px))`;
      if (op === "<=") return `(min-${dim}: ${v})`;
      return `(min-${dim}: calc(${v} + 0.02px))`;
    },
  );
  return p;
}

// ---------- E) expand :is()/:where() ----------

// Compound = không chứa combinator (space > + ~) ở depth 0.
function isCompound(sel) {
  let depth = 0;
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) return false;
  }
  return true;
}

// Compound chỉ gồm class/pseudo/attr (không có type/universal đứng đầu) → gắn
// sau prefix an toàn.
function isAttachable(sel) {
  return isCompound(sel) && /^[.:[#]/.test(sel);
}

// Expand 1 selector (không chứa dấu phẩy top-level). Trả mảng selector đã
// expand, hoặc null nếu không expand được (giữ nguyên).
function expandOne(sel, depthGuard = 0) {
  if (depthGuard > 8) return null;
  const hit = findFn(sel, ":is");
  if (!hit) return [sel];
  const [idx, argStart, end] = hit;
  const prefix = sel.slice(0, idx);
  const suffix = sel.slice(end + 1);
  const alts = splitTopLevel(sel.slice(argStart, end), ",").map((s) => s.trim());

  const results = [];
  for (const alt of alts) {
    let merged = null;
    if (prefix === "" || /[\s>+~]$/.test(prefix)) {
      // :is() đứng đầu (hoặc ngay sau combinator): thay bằng chính alt.
      // Với alt phức (có combinator) chỉ an toàn khi prefix rỗng.
      if (prefix === "" || isCompound(alt)) merged = prefix + alt + suffix;
    } else if (/[\s>+~]\*$/.test(alt)) {
      // PREFIX:is(ANC <combinator> *) → "ANC <combinator> PREFIX"
      // (vd ".dark *" → ".dark PREFIX"; ":where(.peer):disabled~*" → ".peer:disabled~PREFIX")
      merged = alt.slice(0, -1) + prefix + suffix;
    } else if (isAttachable(alt)) {
      // PREFIX:is(.a:hover) → PREFIX.a:hover
      merged = prefix + alt + suffix;
    }
    if (merged == null) return null;
    const sub = expandOne(merged, depthGuard + 1);
    if (sub == null) return null;
    results.push(...sub);
  }
  return results;
}

function expandSelectors(rule, unexpanded) {
  if (!rule.selector || (!rule.selector.includes(":is(") && !rule.selector.includes(":where("))) {
    return;
  }
  // :where → :is (chấp nhận specificity tăng — cùng triết lý gỡ vỏ @layer).
  const source = rule.selector.split(":where(").join(":is(");
  const ok = [];
  const keep = [];
  for (const one of splitTopLevel(source, ",").map((s) => s.trim())) {
    const ex = expandOne(one);
    if (ex == null) keep.push(one);
    else ok.push(...ex);
  }
  if (keep.length && ok.length) {
    // Selector không expand được phải tách rule riêng — 1 selector invalid
    // trong danh sách phẩy làm engine cũ vứt CẢ rule.
    const clone = rule.cloneBefore();
    clone.selectors = ok;
    rule.selectors = keep;
    unexpanded.push(...keep);
  } else if (ok.length) {
    rule.selectors = [...new Set(ok)];
  } else {
    unexpanded.push(...keep);
  }
}

// ---------- I/J) logical shorthand + inset ----------

const LOGICAL_PAIRS = {
  "padding-inline": ["padding-left", "padding-right"],
  "padding-block": ["padding-top", "padding-bottom"],
  "margin-inline": ["margin-left", "margin-right"],
  "margin-block": ["margin-top", "margin-bottom"],
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"],
};

// Longhand logic mà Chromium 83 CHƯA hiểu (inset-* longhand cần 87) — map
// thẳng sang physical (app chỉ chạy LTR tiếng Việt).
const LOGICAL_SINGLE = {
  "inset-inline-start": "left",
  "inset-inline-end": "right",
  "inset-block-start": "top",
  "inset-block-end": "bottom",
};

function expandLogical(decl) {
  const single = LOGICAL_SINGLE[decl.prop];
  if (single) {
    decl.cloneBefore({ prop: single });
    decl.remove();
    return;
  }
  const pair = LOGICAL_PAIRS[decl.prop];
  if (!pair) return;
  const vals = splitTopLevelSpace(decl.value);
  const start = vals[0] || "0";
  const end = vals[1] || start;
  decl.cloneBefore({ prop: pair[0], value: start });
  decl.cloneBefore({ prop: pair[1], value: end });
  decl.remove();
}

function expandInset(decl) {
  const v = splitTopLevelSpace(decl.value);
  let t;
  let r;
  let b;
  let l;
  if (v.length === 1) [t, r, b, l] = [v[0], v[0], v[0], v[0]];
  else if (v.length === 2) [t, r, b, l] = [v[0], v[1], v[0], v[1]];
  else if (v.length === 3) [t, r, b, l] = [v[0], v[1], v[2], v[1]];
  else if (v.length >= 4) [t, r, b, l] = [v[0], v[1], v[2], v[3]];
  else return;
  decl.cloneBefore({ prop: "top", value: t });
  decl.cloneBefore({ prop: "right", value: r });
  decl.cloneBefore({ prop: "bottom", value: b });
  decl.cloneBefore({ prop: "left", value: l });
  decl.remove();
}

// ---------- K) translate:/rotate:/scale: → transform: ----------

// Pipeline đầy đủ kiểu TW v3 — phát NGUYÊN pipeline cho mọi rule chuyển đổi để
// 2 utility (vd -translate-y-1/2 + scale-95) không ghi đè nhau khi cùng quy về
// transform. var() có fallback nên không phụ thuộc @property.
const TRANSFORM_PIPELINE =
  "translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0)) " +
  "rotate(var(--tw-rotate, 0deg)) " +
  "skewX(var(--tw-skew-x, 0deg)) skewY(var(--tw-skew-y, 0deg)) " +
  "scaleX(var(--tw-scale-x, 1)) scaleY(var(--tw-scale-y, 1))";

function downgradeIndividualTransforms(rule) {
  const found = [];
  rule.each((node) => {
    if (node.type === "decl" && (node.prop === "translate" || node.prop === "rotate" || node.prop === "scale")) {
      found.push(node);
    }
  });
  if (!found.length) return;

  const usesVars = found.some((d) => d.value.includes("var(--tw-"));
  if (usesVars) {
    // Utility Tailwind: các biến --tw-* đã được set trong chính rule → thay
    // toàn bộ bằng 1 decl transform pipeline.
    found[0].cloneBefore({ prop: "transform", value: TRANSFORM_PIPELINE });
    found.forEach((d) => d.remove());
    return;
  }
  // Giá trị literal: ghép theo thứ tự chuẩn translate → rotate → scale.
  const parts = [];
  for (const name of ["translate", "rotate", "scale"]) {
    const d = found.find((x) => x.prop === name);
    if (!d || d.value === "none") continue;
    const vals = splitTopLevelSpace(d.value);
    if (name === "translate") parts.push(`translate(${vals[0] || "0"}, ${vals[1] || "0"})`);
    else if (name === "rotate") parts.push(`rotate(${vals[0]})`);
    else parts.push(`scale(${vals[0]}, ${vals[1] || vals[0]})`);
  }
  if (parts.length) found[0].cloneBefore({ prop: "transform", value: parts.join(" ") });
  found.forEach((d) => d.remove());
}

// ---------- plugin ----------

export default function compat() {
  return {
    postcssPlugin: "toda-css-compat",
    OnceExit(root) {
      // A) @property → giá trị mặc định trên *. Tailwind v4 khai báo
      //    --tw-translate/scale/space/ring/shadow... bằng @property (Chrome 85).
      //    WebView cũ bỏ qua @property → biến KHÔNG có giá trị đầu → transform/
      //    space/shadow invalid. Đổ initial-value xuống * để utilities vẫn ghi
      //    đè được (kiểu TW v3).
      const propDefaults = [];
      root.walkAtRules("property", (at) => {
        const name = (at.params || "").trim();
        if (!name.startsWith("--")) return;
        let initial = null;
        at.walkDecls("initial-value", (d) => {
          initial = d.value;
        });
        if (initial !== null && initial.trim() !== "") {
          propDefaults.push(`${name}:${initial.trim()}`);
        }
      });
      if (propDefaults.length) {
        root.prepend(`*,::before,::after,::backdrop{${propDefaults.join(";")}}`);
      }

      // B) Dàn phẳng @layer (Chromium <99 bỏ qua cả khối → mất sạch style).
      //    Tailwind v4 phát các lớp theo ĐÚNG thứ tự ưu tiên nên chỉ cần GỠ VỎ,
      //    KHÔNG dùng polyfill cascade-layers (hack specificity gây vỡ khác).
      root.walkAtRules("layer", (at) => {
        if (at.nodes && at.nodes.length) at.replaceWith(at.nodes);
        else at.remove();
      });

      // C) @supports test tính năng màu hiện đại → gỡ vỏ (bên trong đã được
      //    convert nên áp luôn cũng đúng; engine cũ sẽ evaluate false và vứt
      //    cả khối nếu giữ nguyên).
      root.walkAtRules("supports", (at) => {
        if (/color-mix\(|oklch\(|oklab\(|@property|container-type/i.test(at.params) && !/\bnot\b/i.test(at.params)) {
          if (at.nodes && at.nodes.length) at.replaceWith(at.nodes);
          else at.remove();
        }
      });

      // D) @media range syntax (width >= X) — Chrome 104. Không xử là MẤT TOÀN
      //    BỘ responsive sm:/md:/lg: trên WebView cũ.
      root.walkAtRules("media", (at) => {
        if (/[<>]/.test(at.params)) at.params = downgradeMediaParams(at.params);
      });

      // E) :is()/:where() — Chrome 88. Tailwind v4 dùng cho dark:, space-*,
      //    divide-*, group-/peer-* → rule bị vứt nguyên con trên engine cũ.
      const unexpanded = [];
      root.walkRules((rule) => expandSelectors(rule, unexpanded));
      if (unexpanded.length) {
        const uniq = [...new Set(unexpanded)];
        console.warn(
          `[toda-css-compat] ${uniq.length} selector chưa expand được :is/:where (sẽ bị bỏ qua trên WebView cũ):\n  ` +
            uniq.slice(0, 20).join("\n  "),
        );
      }

      // F+G+H) decls: oklch/oklab → rgb, color-mix → màu đặc, dvh/svh → vh.
      root.walkDecls((decl) => {
        if (!decl.value) return;
        if (decl.value.includes("oklch(") || decl.value.includes("oklab(")) {
          decl.value = replaceOkColors(decl.value);
        }
        if (decl.value.includes("color-mix(")) {
          decl.value = replaceColorMix(decl.value);
        }
        if (/\b[\d.]+(dvh|svh|dvw|svw)\b/.test(decl.value)) {
          // Fallback vh/vw đặt TRƯỚC — engine mới ăn decl gốc, engine cũ ăn fallback.
          decl.cloneBefore({
            value: decl.value.replace(/\b([\d.]+)(?:dvh|svh)\b/g, "$1vh").replace(/\b([\d.]+)(?:dvw|svw)\b/g, "$1vw"),
          });
        }
      });

      // I) logical shorthand (padding-inline = px-*, margin-inline = mx-*...) —
      //    Chrome 87. Không xử là mất padding/margin ngang → chữ dính.
      root.walkDecls((decl) => expandLogical(decl));

      // J) inset shorthand (inset-0 của overlay) — Chrome 87.
      root.walkDecls("inset", (decl) => expandInset(decl));

      // K) translate:/rotate:/scale: thuộc tính riêng — Chrome 104. Đây là lý
      //    do dialog mất translate(-50%,-50%) → lệch khỏi màn hình.
      root.walkRules((rule) => downgradeIndividualTransforms(rule));
    },
  };
}
compat.postcss = true;
