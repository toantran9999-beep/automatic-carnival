// toda-data.jsx — brand emblem, icons, menu data, helpers
// All exported to window for cross-script use.

const fmtVND = (n) => n.toLocaleString("vi-VN") + "đ";

// ---- Brand emblem: simple stylized tree inside a ring (Toda Café mark) ----
function TodaMark({ size = 40, stroke = "currentColor", fill = "none" }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" stroke={stroke} strokeWidth="1.6" fill={fill} />
      <path d="M24 35 L24 21" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="16.5" r="6.2" stroke={stroke} strokeWidth="1.8" />
      <circle cx="17" cy="21" r="4.4" stroke={stroke} strokeWidth="1.6" />
      <circle cx="31" cy="21" r="4.4" stroke={stroke} strokeWidth="1.6" />
      <path d="M18.5 35 h11" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---- Lightweight stroke icons (no external deps) ----
const I = (paths, vb = "0 0 24 24") => ({ size = 20, stroke = "currentColor", sw = 1.7 }) => (
  <svg width={size} height={size} viewBox={vb} fill="none" stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const Icons = {
  dashboard: I(<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>),
  pos: I(<><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><line x1="9" y1="18.5" x2="15" y2="18.5"/></>),
  orders: I(<><path d="M8 4h8l3 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z"/><path d="M5 8h14"/><path d="M9 12h6M9 15.5h4"/></>),
  table: I(<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="9" x2="9" y2="21"/></>),
  kitchen: I(<><path d="M7 2v6M11 2v6M9 8v13M15 21V3a4 4 0 0 1 4 4v6h-4"/></>),
  wifi: I(<><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/></>),
  menu: I(<><path d="M4 6h16M4 12h16M4 18h10"/></>),
  box: I(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></>),
  staff: I(<><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 20a5 5 0 0 0-3-4.6"/></>),
  card: I(<><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><line x1="2.5" y1="9.5" x2="21.5" y2="9.5"/><line x1="6" y1="14.5" x2="11" y2="14.5"/></>),
  heart: I(<><path d="M12 20s-7-4.3-9.3-8.5C1 8 2.8 4.8 6 4.8c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.2 0 5 3.2 3.3 6.7C19 15.7 12 20 12 20z"/></>),
  chart: I(<><path d="M4 20V4M4 20h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></>),
  settings: I(<><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6"/></>),
  search: I(<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></>),
  cart: I(<><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h2.5l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.9a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/></>),
  user: I(<><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>),
  bell: I(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></>),
  branch: I(<><path d="M3 21V8l9-5 9 5v13"/><path d="M3 21h18M9 21v-6h6v6"/></>),
  plus: I(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  minus: I(<><line x1="5" y1="12" x2="19" y2="12"/></>),
  trash: I(<><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></>),
  check: I(<><polyline points="4 12 10 18 20 6"/></>),
  bag: I(<><path d="M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>),
  chevron: I(<><polyline points="6 9 12 15 18 9"/></>),
  chevronL: I(<><polyline points="15 18 9 12 15 6"/></>),
  note: I(<><path d="M4 5h16v10l-4 4H4z"/><path d="M14 19v-4h4"/></>),
  x: I(<><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>),
  logout: I(<><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M9 8l-4 4 4 4M5 12h11"/></>),
  clock: I(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
  sparkle: I(<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></>),
};

// ---- Navigation structure ----
const NAV = [
  { group: "CHUNG", items: [{ id: "dashboard", label: "Bảng điều khiển", icon: "dashboard" }] },
  { group: "HOẠT ĐỘNG", items: [
    { id: "pos", label: "POS (Bán hàng)", icon: "pos" },
    { id: "orders", label: "Đơn hàng", icon: "orders", badge: 3 },
    { id: "tables", label: "Bàn ăn", icon: "table" },
    { id: "kitchen", label: "Nhà bếp", icon: "kitchen", badge: 2 },
    { id: "menu", label: "Thực đơn", icon: "menu" },
  ]},
  { group: "QUẢN LÝ", items: [
    { id: "stock", label: "Kho hàng", icon: "box" },
    { id: "staff", label: "Nhân viên", icon: "staff" },
    { id: "pay", label: "Thanh toán", icon: "card" },
  ]},
  { group: "KINH DOANH", items: [
    { id: "loyal", label: "Khách hàng thân thiết", icon: "heart" },
    { id: "report", label: "Báo cáo", icon: "chart" },
    { id: "settings", label: "Cài đặt", icon: "settings" },
  ]},
];

// ---- Categories ----
const CATS = [
  { id: "all", label: "Tất cả" },
  { id: "coffee", label: "CÀ PHÊ" },
  { id: "smoothie", label: "SINH TỐ & ĐÁ XAY" },
  { id: "tea", label: "TRÀ & MÓN KHÁC" },
  { id: "beans", label: "CÀ PHÊ BỘT HẠT" },
  { id: "tobacco", label: "THUỐC LÁ" },
];

// ---- Menu items. opts: which option groups apply ----
const MENU = [
  // CÀ PHÊ
  { id: "cf1", name: "Cà phê đá", price: 15000, cat: "coffee", opts: ["size","ice","sugar"] },
  { id: "cf2", name: "Cà phê đá (nhẹ)", price: 13000, cat: "coffee", opts: ["size","ice","sugar"] },
  { id: "cf3", name: "Cà phê sữa đá", price: 18000, cat: "coffee", opts: ["size","ice","sugar"], hot: true },
  { id: "cf4", name: "Cà phê sữa đá (nhẹ)", price: 16000, cat: "coffee", opts: ["size","ice","sugar"] },
  { id: "cf5", name: "Bạc xỉu", price: 20000, cat: "coffee", opts: ["size","ice","sugar"], hot: true },
  { id: "cf6", name: "Bạc xỉu (nhẹ)", price: 18000, cat: "coffee", opts: ["size","ice","sugar"] },
  { id: "cf7", name: "Americano đá", price: 15000, cat: "coffee", opts: ["size","ice","sugar"] },
  { id: "cf8", name: "Cappuccino", price: 35000, cat: "coffee", opts: ["size","temp"] },
  { id: "cf9", name: "Latte", price: 35000, cat: "coffee", opts: ["size","temp"] },
  { id: "cf10", name: "Cà phê cốt dừa", price: 30000, cat: "coffee", opts: ["size"] },
  { id: "cf11", name: "Espresso", price: 20000, cat: "coffee", opts: ["temp"] },
  // SINH TỐ & ĐÁ XAY
  { id: "sm1", name: "Sinh tố bơ", price: 30000, cat: "smoothie", opts: ["size","sugar"] },
  { id: "sm2", name: "Sinh tố xoài", price: 28000, cat: "smoothie", opts: ["size","sugar"] },
  { id: "sm3", name: "Đá xay matcha", price: 35000, cat: "smoothie", opts: ["size","sugar"] },
  { id: "sm4", name: "Đá xay socola", price: 35000, cat: "smoothie", opts: ["size","sugar"] },
  { id: "sm5", name: "Cookie đá xay", price: 38000, cat: "smoothie", opts: ["size","sugar"] },
  // TRÀ & MÓN KHÁC
  { id: "te1", name: "Ly trà đá", price: 2000, cat: "tea", opts: [] },
  { id: "te2", name: "Trà đào cam sả", price: 30000, cat: "tea", opts: ["size","ice","sugar"] },
  { id: "te3", name: "Trà vải", price: 30000, cat: "tea", opts: ["size","ice","sugar"] },
  { id: "te4", name: "Trà chanh", price: 20000, cat: "tea", opts: ["size","ice","sugar"] },
  { id: "te5", name: "Trà tắc", price: 20000, cat: "tea", opts: ["size","ice","sugar"] },
  { id: "te6", name: "Trà sữa trân châu", price: 32000, cat: "tea", opts: ["size","ice","sugar","topping"] },
  { id: "te7", name: "Nước suối", price: 10000, cat: "tea", opts: [] },
  // CÀ PHÊ BỘT HẠT
  { id: "bn1", name: "Cà phê bột 500g", price: 120000, cat: "beans", opts: [] },
  { id: "bn2", name: "Cà phê hạt 500g", price: 150000, cat: "beans", opts: [] },
  { id: "bn3", name: "Phin pha cà phê", price: 45000, cat: "beans", opts: [] },
  // THUỐC LÁ
  { id: "tb1", name: "Thăng Long", price: 25000, cat: "tobacco", opts: [] },
  { id: "tb2", name: "Vinataba", price: 28000, cat: "tobacco", opts: [] },
  { id: "tb3", name: "555", price: 35000, cat: "tobacco", opts: [] },
];

// ---- Option groups (size adds price) ----
const OPT_GROUPS = {
  size:    { label: "Kích cỡ", choices: [{ k: "S", add: 0 }, { k: "M", add: 5000 }, { k: "L", add: 10000 }], def: "S" },
  ice:     { label: "Lượng đá", choices: [{ k: "Không đá", add: 0 }, { k: "Ít đá", add: 0 }, { k: "Bình thường", add: 0 }, { k: "Nhiều đá", add: 0 }], def: "Bình thường" },
  sugar:   { label: "Đường", choices: [{ k: "0%", add: 0 }, { k: "30%", add: 0 }, { k: "50%", add: 0 }, { k: "70%", add: 0 }, { k: "100%", add: 0 }], def: "100%" },
  temp:    { label: "Nóng / Lạnh", choices: [{ k: "Nóng", add: 0 }, { k: "Đá", add: 0 }], def: "Đá" },
  topping: { label: "Topping", choices: [{ k: "Không", add: 0 }, { k: "Trân châu", add: 5000 }, { k: "Thạch", add: 5000 }, { k: "Pudding", add: 7000 }], def: "Không" },
};

// Category tonal accents for product-tile placeholders (hue varies, chroma steady)
const CAT_TONE = {
  coffee:   { h: 60,  c: 0.045, name: "CÀ PHÊ" },
  smoothie: { h: 150, c: 0.05,  name: "SINH TỐ" },
  tea:      { h: 135, c: 0.055, name: "TRÀ" },
  beans:    { h: 40,  c: 0.05,  name: "BỘT HẠT" },
  tobacco:  { h: 25,  c: 0.03,  name: "THUỐC LÁ" },
};

const TABLES = ["Bàn 01","Bàn 02","Bàn 03","Bàn 04","Bàn 05","Bàn 06","Bàn 07","Bàn 08","Bàn 09","Bàn 10","Bàn VIP 1","Bàn VIP 2"];

Object.assign(window, { fmtVND, TodaMark, Icons, NAV, CATS, MENU, OPT_GROUPS, CAT_TONE, TABLES });
