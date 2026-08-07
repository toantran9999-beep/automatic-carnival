/**
 * Nạp công thức định lượng từ SOP Mục IV vào bảng recipe_ingredients, và phần chênh
 * theo tùy chọn vào modifier_ingredients.
 *
 * Chạy:  docker compose run --rm migrate bun run src/setup-toda-recipes.ts
 *        (chạy SAU setup-toda-inventory.ts — script này chỉ nối tên, không tạo nguyên liệu)
 *
 * - Khớp món và nguyên liệu theo TÊN, không hardcode UUID: mỗi chi nhánh một bộ id.
 * - Idempotent: ghi đè công thức của đúng những món có trong bảng dưới đây, món khác
 *   không đụng tới.
 * - Món nào thiếu nguyên liệu hoặc chưa có định lượng thì BỎ QUA và in ra — thà để
 *   trống cho trang Công thức báo "Chưa có" còn hơn đoán bừa một con số rồi để kho
 *   sai âm thầm.
 *
 * ⚠️ CHƯA CÓ ĐỊNH LƯỢNG (SOP không ghi) — cố ý để trống:
 *   Trà lài (đang pha ước chừng, cần cân lại), Espresso (nóng), Espresso nhẹ (nóng),
 *   Cà phê V60, Cà phê đá/sữa đá (pha phin), Cà phê mix, Cà phê sữa đặc biệt,
 *   Hồng trà, Trà gừng, Trà chanh gừng, Ly trà đá, Cacao kem muối, Matcha kem muối,
 *   Cam vắt, Sữa tươi, Chanh đá.
 *
 * ⚠️ "Blend" và "Mix" (tùy chọn Loại hạt, và món "Cà phê đá (Blend)") đang trỏ vào
 *   bao riêng vì CHƯA biết trộn từ gì. Nếu hoá ra chúng chính là Toda 2 / Toda 3 thì
 *   gộp lại — sửa cả LO_HAT_DANG_DUNG lẫn công thức món, đừng để hai chỗ lệch nhau.
 */
import { db, schema } from "./index";
import { and, eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Hằng số
// ---------------------------------------------------------------------------

/** 2 shot (double) = 18g bột. Đây là MẶC ĐỊNH của một ly ở Toda. */
const SHOT2 = 18;
/** 1 shot pha riêng = 12g. Tùy chọn "Nhẹ" rơi về mức này. */
const SHOT1 = 12;

/**
 * ⚠️ ƯỚC LƯỢNG, không có trong SOP: lượng đá và nước lọc mỗi ly. Để ở đây thành hằng
 * số để sửa một chỗ khi cân lại thực tế. Sai vài chục gram đá không ảnh hưởng tiền,
 * nhưng cần có số thì mới biết lúc nào hết đá.
 *
 * Quán chỉ có hai cỡ ly: 360ml (mặc định) và 700ml (Americano, soda).
 */
const DA_360 = 110;
const DA_700 = 250;
const NUOC_AMERICANO = 400;

/** Nguyên liệu hạt mặc định của mọi món cà phê khi khách không chọn "Loại hạt". */
const HAT_NEN = "Hạt Robusta — Đắk Lắk";

/**
 * Tùy chọn "Loại hạt" trỏ tới lô hạt nào. Khoá = tên tùy chọn ĐANG CHẠY trên POS.
 *
 * ⚠️ Đây là chỗ duy nhất cần sửa khi nhập lô hạt mới — hoặc đổi ngay trên giao diện,
 * mục "Lô hạt đang dùng" ở tab Định lượng. Tùy chọn không có trong bảng này sẽ được
 * BÁO RA chứ không đoán bừa.
 */
const LO_HAT_DANG_DUNG: Record<string, string> = {
  "Arabica Brazil": "Hạt Arabica — Brazil Cerrado",
  "Arabica Cầu Đất": "Hạt Arabica — Cầu Đất",
  "Robusta Honey": "Hạt Robusta mật ong",
  Blend: "Hạt Blend",
  Mix: "Hạt Mix",
};

const LY_360 = "Ly nhựa 360ml";
const LY_700 = "Ly nhựa 700ml";

/** Bao bì mặc định của một ly nước — SOP Mục V (đóng gói). */
const BAO_BI: [string, number][] = [
  [LY_360, 1],
  ["Nắp ly", 1],
  ["Ống hút", 1],
];

// ---------------------------------------------------------------------------
// Công thức nền — tên món phải khớp ĐÚNG tên trên thực đơn
// ---------------------------------------------------------------------------

type Recipe = [ingredient: string, qty: number][];

const ROBUSTA = "Hạt Robusta — Đắk Lắk";
const MAT_ONG = "Hạt Robusta mật ong";

/**
 * Sinh công thức cho các túi cà phê Toda 1–4 ở mọi khối lượng đang bán.
 *
 * Tỉ lệ lấy từ bảng giá sỉ B2B (bang-gia-b2b-TODA.pdf). Viết thành hàm thay vì gõ
 * tay 6 dòng: thêm cỡ túi mới chỉ cần thêm một số vào SIZES, khỏi lo quên loại nào.
 */
function todaBlends(): Record<string, Recipe> {
  /** [số Toda, % Robusta Đắk Lắk, % Robusta mật ong] */
  const BLENDS: [n: number, robusta: number, matOng: number][] = [
    [1, 1, 0],
    [2, 0.8, 0.2],
    [3, 0.6, 0.4],
    [4, 0, 1],
  ];
  /** Nhãn hiện trên thực đơn → số gam thật. */
  const SIZES: [label: string, gram: number][] = [
    ["250g", 250],
    ["500g", 500],
    ["3kg", 3000],
  ];

  const out: Record<string, Recipe> = {};
  for (const [n, pRobusta, pMatOng] of BLENDS) {
    for (const [label, gram] of SIZES) {
      const recipe: Recipe = [];
      if (pRobusta > 0) recipe.push([ROBUSTA, gram * pRobusta]);
      if (pMatOng > 0) recipe.push([MAT_ONG, gram * pMatOng]);
      // Món nào không có trên thực đơn thì vòng nạp tự bỏ qua và in ra — cứ khai
      // đủ tổ hợp ở đây, khỏi phải dò xem cỡ nào đang bán.
      out[`Cà phê Toda ${n} (${label})`] = recipe;
    }
  }
  return out;
}

const RECIPES: Record<string, Recipe> = {
  // --- Nhóm cà phê (SOP IV.1) ---

  // Thường: Ít 4g / Vừa 7g / Nhiều 10g đường → nền lấy mức Vừa.
  "Cà phê đá": [[HAT_NEN, SHOT2], ["Đường vàng", 7], ["Đá viên", DA_360], ...BAO_BI],

  // Hai món dưới là cùng công thức, khác đúng loại hạt (bán thành món riêng trên
  // thực đơn chứ không qua tùy chọn).
  "Cà phê đá (hạt Arabica)": [
    ["Hạt Arabica — Brazil Cerrado", SHOT2],
    ["Đường vàng", 7],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  // Dùng chung bao "Hạt Blend" với tùy chọn "Loại hạt — Blend" cho nhất quán.
  // ⚠️ Chưa rõ Blend trộn từ gì; nếu hoá ra là Toda 2 (80/20) thì sửa ở đây và ở
  // LO_HAT_DANG_DUNG, đừng để hai chỗ trỏ hai bao khác nhau.
  "Cà phê đá (Blend)": [
    ["Hạt Blend", SHOT2],
    ["Đường vàng", 7],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // Thường: Ít 20g / Vừa 30g / Nhiều 35g sữa đặc → nền lấy Vừa.
  "Cà phê sữa đá": [[HAT_NEN, SHOT2], ["Sữa đặc", 30], ["Đá viên", DA_360], ...BAO_BI],

  // Hai món "(nhẹ)" vẫn còn đứng riêng trên thực đơn (chưa gộp hết vào tùy chọn
  // "Độ đậm"). SOP có cột Nhẹ riêng: 1 shot, bớt 1g đường, +25ml nước.
  //
  // Để "nhẹ" chỉ trừ ĐÚNG MỘT LẦN, script gỡ luôn nhóm "Độ đậm" khỏi chính mấy món
  // này (xem detachDoDamFromLightItems bên dưới) — món đã nhẹ sẵn thì không cho
  // chọn nhẹ thêm lần nữa.
  "Cà phê đá (nhẹ)": [
    [HAT_NEN, SHOT1],
    ["Đường vàng", 6],
    ["Nước lọc", 25],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Cà phê sữa đá (nhẹ)": [
    [HAT_NEN, SHOT1],
    ["Sữa đặc", 25],
    ["Nước lọc", 25],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // 30g sữa đặc + 50ml sữa tươi + 4g đường + đá → cà phê đổ lên tầng.
  "Bạc xỉu": [
    [HAT_NEN, SHOT2],
    ["Sữa đặc", 30],
    ["Sữa tươi", 50],
    ["Đường vàng", 4],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // 40g sữa đặc + 40g nước sôi đánh sủi bọt → đá → cà phê lên trên.
  "Bạc xỉu truyền thống": [
    [HAT_NEN, SHOT2],
    ["Sữa đặc", 40],
    ["Nước lọc", 40],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // 30g sữa đặc + cà phê + kem muối phủ lên (kem muối: 0.5g muối + 25ml sữa tươi
  // + 4.5g đường + xanthan + 20g whipping).
  "Cà phê muối": [
    [HAT_NEN, SHOT2],
    ["Sữa đặc", 30],
    ["Muối", 0.5],
    ["Sữa tươi", 25],
    ["Đường vàng", 4.5],
    ["Bột xanthan", 0.2],
    ["Whipping cream", 20],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  "Cà phê vết loang": [
    [HAT_NEN, SHOT2],
    ["Sữa đặc", 30],
    ["Sữa tươi", 50],
    ["Đường vàng", 4],
    ["Whipping cream", 5],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  "Cà phê sữa hạnh nhân": [
    [HAT_NEN, SHOT2],
    ["Sữa đặc", 30],
    ["Sữa tươi", 50],
    ["Hạnh nhân", 7],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // 100ml sữa tươi + 15ml nước đường → đá → cà phê lên trên.
  "Cà phê sữa tươi": [
    [HAT_NEN, SHOT2],
    ["Sữa tươi", 100],
    ["Nước đường", 15],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // Ly 700ml: đá → nước lọc gần đầy → cà phê lên trên.
  "Americano đá": [
    [HAT_NEN, SHOT2],
    ["Nước lọc", NUOC_AMERICANO],
    ["Đá viên", DA_700],
    [LY_700, 1],
    ["Nắp ly", 1],
    ["Ống hút", 1],
  ],

  // --- Nhóm trà & soda (SOP IV.2) ---

  "Trà chanh": [
    ["Túi lọc Lipton", 1],
    ["Nước lọc", 130],
    ["Nước đường", 40],
    ["Chanh", 10],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà tắc": [
    ["Túi lọc Lipton", 1],
    ["Nước lọc", 130],
    ["Nước đường", 40],
    ["Tắc", 2],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà tắc xí muội": [
    ["Xí muội", 2],
    ["Túi lọc Lipton", 1],
    ["Nước lọc", 130],
    ["Nước đường", 40],
    ["Tắc", 2],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà chanh quế": [
    ["Bột quế", 0.5],
    ["Túi lọc Lipton", 1],
    ["Nước lọc", 130],
    ["Nước đường", 40],
    ["Chanh", 11],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà chanh bạc hà": [
    ["Gói trà xanh", 1],
    ["Nước lọc", 130],
    ["Nước đường", 30],
    ["Chanh", 10],
    ["Syrup bạc hà", 10],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  // SOP "Trà Xanh Bạc Hà" — không chanh.
  "Trà bạc hà": [
    ["Gói trà xanh", 1],
    ["Nước lọc", 130],
    ["Nước đường", 25],
    ["Syrup bạc hà", 10],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà bông cúc": [
    ["Bông cúc", 1],
    ["Nước lọc", 130],
    ["Nước đường", 40],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà Atiso đỏ": [
    ["Atiso đỏ", 2],
    ["Nước lọc", 130],
    ["Nước đường", 40],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà dâu tây": [
    ["Túi lọc Lipton", 1],
    ["Nước lọc", 100],
    ["Nước đường", 40],
    ["Dâu tây", 5],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Trà đào": [
    ["Túi lọc Lipton", 1],
    ["Nước lọc", 130],
    ["Nước đường", 20],
    ["Mứt đào", 35],
    ["Syrup đào", 10],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Soda chanh": [
    ["Soda", 160],
    ["Nước đường", 40],
    ["Chanh", 10],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Soda chanh bạc hà": [
    ["Soda", 160],
    ["Nước đường", 30],
    ["Chanh", 10],
    ["Syrup bạc hà", 10],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // --- Nhóm đá xay & cacao/matcha (SOP IV.3) ---

  "Cacao sữa": [
    ["Bột cacao", 5.5],
    ["Nước lọc", 40],
    ["Sữa đặc", 30],
    ["Sữa tươi", 55],
    ["Đường vàng", 3.5],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Matcha sữa": [
    ["Bột matcha", 3],
    ["Nước lọc", 40],
    ["Sữa đặc", 25],
    ["Sữa tươi", 50],
    ["Đường vàng", 3.5],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Cacao đá xay": [
    ["Bột cacao", 7],
    ["Sữa tươi", 50],
    ["Whipping cream", 10],
    ["Nước đường", 25],
    ["Sữa đặc", 25],
    ["Bột xanthan", 0.2],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Matcha đá xay": [
    ["Bột matcha", 4],
    ["Sữa tươi", 50],
    ["Whipping cream", 5],
    ["Nước đường", 25],
    ["Sữa đặc", 25],
    ["Bột xanthan", 0.2],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],
  "Cà phê đá xay": [
    [HAT_NEN, SHOT2],
    ["Sữa tươi", 50],
    ["Whipping cream", 10],
    ["Caramel", 5],
    ["Nước đường", 25],
    ["Sữa đặc", 25],
    ["Bột xanthan", 0.2],
    ["Đá viên", DA_360],
    ...BAO_BI,
  ],

  // --- Nhóm sữa chua (SOP IV.4) ---
  // Nền: 1 hũ sữa chua + 25g sữa đặc + xanthan + 1 ly đá 300ml.

  // SOP gọi là "Sữa chua cơ bản"; trên thực đơn tên là "Sữa chua đá xay".
  "Sữa chua đá xay": [
    ["Sữa chua", 1],
    ["Sữa đặc", 25],
    ["Bột xanthan", 0.2],
    ["Đá viên", 300],
    ["Tắc", 1],
    ["Nước đường", 25],
    ...BAO_BI,
  ],
  "Sữa chua dâu tây": [
    ["Sữa chua", 1],
    ["Sữa đặc", 25],
    ["Bột xanthan", 0.2],
    ["Đá viên", 300],
    ["Dâu tây", 5],
    ["Nước đường", 25],
    ...BAO_BI,
  ],
  "Sữa chua việt quất": [
    ["Sữa chua", 1],
    ["Sữa đặc", 25],
    ["Bột xanthan", 0.2],
    ["Đá viên", 300],
    ["Tắc", 1],
    ["Việt quất", 8],
    ["Mứt việt quất", 25],
    ["Nước đường", 15],
    ...BAO_BI,
  ],

  // --- Cà phê bột/hạt bán túi (bảng giá sỉ B2B) ---
  //
  // Toda 1–4 KHÔNG phải bốn bao hàng riêng: chỉ là hai loại hạt gốc trộn theo tỉ lệ.
  //   1. Mạnh Mẽ   — 100% Robusta Đắk Lắk
  //   2. Đậm Nhẹ   — 80% Robusta + 20% Robusta mật ong
  //   3. Cân Bằng  — 60% Robusta + 40% Robusta mật ong
  //   4. Ngọt Ngào — 100% Robusta mật ong
  // Nhờ vậy bán một túi Toda 3 (500g) là trừ đúng 300g bao Robusta + 200g bao mật
  // ong — kho biết thật sự còn bao nhiêu mỗi loại, thay vì bốn con số rời rạc.
  //
  // Tùy chọn "Đóng gói: Hạt / Bột" chỉ đổi cách xay, không đổi định lượng.
  ...todaBlends(),

  // --- Hàng bán nguyên gói: bán 1 trừ 1, không pha chế gì ---
  "Thuốc lá Sài Gòn bạc": [["Thuốc lá Sài Gòn bạc", 1]],
  "Thuốc lá Con Mèo nhỏ": [["Thuốc lá Con Mèo nhỏ", 1]],
  "Thuốc lá 555": [["Thuốc lá 555", 1]],
  "Hột quẹt": [["Hột quẹt", 1]],
  "Nước suối Lavie": [["Nước suối Lavie", 1]],
};

// ---------------------------------------------------------------------------
// Phần chênh theo tùy chọn
// ---------------------------------------------------------------------------

type ModRule = {
  group: string;
  modifier: string;
  /** Cộng/trừ so với nền. Số âm = bớt đi. */
  deltas?: [ingredient: string, delta: number][];
  /** Thay nguyên liệu, giữ nguyên lượng: [nguyên liệu bị thay, nguyên liệu thay vào] */
  replace?: [from: string, to: string];
};

/**
 * ⚠️ Tên nhóm/tùy chọn dưới đây phải khớp ĐÚNG cái đang chạy trên POS ("Sữa đặc 1",
 * "Ít đường"…), không phải tên trong SOP. Sai một chữ là dòng đó im lặng bị bỏ qua —
 * script sẽ in ra danh sách không khớp, đọc log sau mỗi lần chạy.
 *
 * Chỉ đụng vào ĐỊNH LƯỢNG. Giá của tùy chọn giữ nguyên tuyệt đối.
 */
const MOD_RULES: ModRule[] = [
  // "Nhẹ" = 1 shot thay vì 2 → 18g về 12g. SOP còn ghi bớt 1g đường và thêm 25ml nước.
  {
    group: "Độ đậm",
    modifier: "Nhẹ",
    deltas: [
      [HAT_NEN, SHOT1 - SHOT2],
      ["Đường vàng", -1],
      ["Nước lọc", 25],
    ],
  },

  // Đường (nhóm chỉ gắn cho món cà phê nên đơn vị là đường vàng theo g).
  // SOP: Ít 4g / Vừa 7g / Nhiều 10g. Nền là Vừa.
  { group: "Đường", modifier: "Ít đường", deltas: [["Đường vàng", -3]] },
  { group: "Đường", modifier: "Nhiều đường", deltas: [["Đường vàng", 3]] },
  { group: "Đường", modifier: "Không đường", deltas: [["Đường vàng", -7]] },
  // "Rất nhiều đường" và "Đường ăn kiêng": SOP không có số, cố ý bỏ trống.

  // Sữa đặc — tên tùy chọn đã ghi sẵn số gram, khỏi phải đoán. Nền 30g.
  { group: "Sữa đặc 1", modifier: "Rất ít sữa 15g", deltas: [["Sữa đặc", -15]] },
  { group: "Sữa đặc 1", modifier: "Ít sữa 20g", deltas: [["Sữa đặc", -10]] },
  { group: "Sữa đặc 1", modifier: "Sữa đặc 35g", deltas: [["Sữa đặc", 5]] },
  {
    // Đúng ghi chú SOP: "Nhiều sữa: +5g đường nước".
    group: "Sữa đặc 1",
    modifier: "Sữa đặc 35g + 5g đường nước",
    deltas: [
      ["Sữa đặc", 5],
      ["Nước đường", 5],
    ],
  },
  // "Sữa đặc 30g" = đúng mức nền → không cần dòng nào.

  // Đá — ⚠️ ước lượng như DA_360.
  { group: "Đá", modifier: "Ít đá", deltas: [["Đá viên", -40]] },
  { group: "Đá", modifier: "Rất ít đá", deltas: [["Đá viên", -75]] },
  { group: "Đá", modifier: "Không đá", deltas: [["Đá viên", -DA_360]] },
  { group: "Đá", modifier: "Nóng", deltas: [["Đá viên", -DA_360]] },
  // Đá để riêng = tốn thêm một cái ly, đá vẫn đủ chừng đó.
  { group: "Đá", modifier: "Đá riêng", deltas: [[LY_360, 1]] },

  { group: "Món thêm", modifier: "Thêm 1 shot cà phê", deltas: [[HAT_NEN, SHOT1]] },
  { group: "Món thêm", modifier: "Thêm 2 shot cà phê", deltas: [[HAT_NEN, SHOT2]] },
  { group: "Món thêm", modifier: "Thêm soda", deltas: [["Soda", 160]] },
  { group: "Món thêm", modifier: "Thêm chanh", deltas: [["Chanh", 10]] },
  // "Thêm món" (3 mức giá) là ô mở cho thu ngân gõ tay — không gắn nguyên liệu nào.
  // "Đóng gói: Hạt / Bột" chỉ đổi cách xay, không đổi định lượng.
];

// ---------------------------------------------------------------------------

async function setupForBranch(branchId: string) {
  // Bảng tra tên → id, chuẩn hoá chữ thường để khỏi vướng hoa/thường.
  const key = (s: string) => s.trim().toLowerCase();

  const invRows = await db
    .select({ id: schema.inventoryItems.id, name: schema.inventoryItems.name })
    .from(schema.inventoryItems)
    .where(eq(schema.inventoryItems.branch_id, branchId));
  const invByName = new Map(invRows.map((r) => [key(r.name), r.id]));

  const menuRows = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.branch_id, branchId));
  const menuByName = new Map(menuRows.map((r) => [key(r.name), r.id]));

  // --- 1) Công thức nền ---
  let done = 0;
  const missingMenu: string[] = [];
  const missingIng = new Set<string>();

  for (const [itemName, recipe] of Object.entries(RECIPES)) {
    const menuItemId = menuByName.get(key(itemName));
    if (!menuItemId) {
      missingMenu.push(itemName);
      continue;
    }

    const rows: { menu_item_id: string; inventory_item_id: string; quantity_used: string }[] = [];
    let broken = false;
    for (const [ingName, qty] of recipe) {
      const invId = invByName.get(key(ingName));
      if (!invId) {
        missingIng.add(ingName);
        broken = true;
        continue;
      }
      rows.push({
        menu_item_id: menuItemId,
        inventory_item_id: invId,
        quantity_used: String(qty),
      });
    }

    // Thiếu một nguyên liệu là ghi vào công thức QUE — trừ kho sẽ thiếu vế đó mà
    // không báo gì. Thà bỏ qua cả món để trang Công thức hiện "Chưa có".
    if (broken) continue;

    await db
      .delete(schema.recipeIngredients)
      .where(eq(schema.recipeIngredients.menu_item_id, menuItemId));
    await db.insert(schema.recipeIngredients).values(rows);
    done++;
  }

  console.log(`  ✓ Công thức nền: ${done}/${Object.keys(RECIPES).length} món.`);
  if (missingMenu.length) {
    console.log(`  · Không có trên thực đơn (bỏ qua): ${missingMenu.join(", ")}`);
  }

  // --- 2) Phần chênh theo tùy chọn ---
  const groups = await db
    .select({ id: schema.modifierGroups.id, name: schema.modifierGroups.name })
    .from(schema.modifierGroups)
    .where(eq(schema.modifierGroups.branch_id, branchId));
  const groupIds = groups.map((g) => g.id);

  if (groupIds.length === 0) {
    console.log("  ! Chi nhánh chưa có nhóm tùy chọn — bỏ qua phần chênh.");
    reportMissingIngredients(missingIng);
    return;
  }

  const mods = await db
    .select({
      id: schema.modifiers.id,
      name: schema.modifiers.name,
      group_id: schema.modifiers.group_id,
    })
    .from(schema.modifiers)
    .where(inArray(schema.modifiers.group_id, groupIds));

  const groupNameById = new Map(groups.map((g) => [g.id, key(g.name)]));
  const findMod = (groupName: string, modName: string) =>
    mods.find(
      (m) => groupNameById.get(m.group_id) === key(groupName) && key(m.name) === key(modName),
    );

  const rules: ModRule[] = [...MOD_RULES];

  // Nhóm "Loại hạt" dựng từ bảng LO_HAT_DANG_DUNG — mỗi tùy chọn là một phép THAY
  // nguyên liệu, không phải cộng/trừ.
  for (const m of mods) {
    if (groupNameById.get(m.group_id) !== key("Loại hạt")) continue;
    const lot = LO_HAT_DANG_DUNG[m.name.trim()];
    if (!lot) {
      console.log(`  · "Loại hạt — ${m.name}" chưa gán lô hạt → gán trên giao diện (tab Định lượng).`);
      continue;
    }
    if (key(lot) === key(HAT_NEN)) continue; // Trùng hạt nền, không cần thay gì.
    rules.push({ group: "Loại hạt", modifier: m.name, replace: [HAT_NEN, lot] });
  }

  let modDone = 0;
  const missingMod: string[] = [];

  for (const rule of rules) {
    const mod = findMod(rule.group, rule.modifier);
    if (!mod) {
      missingMod.push(`${rule.group} — ${rule.modifier}`);
      continue;
    }

    await db
      .delete(schema.modifierIngredients)
      .where(eq(schema.modifierIngredients.modifier_id, mod.id));

    const values: (typeof schema.modifierIngredients.$inferInsert)[] = [];

    if (rule.replace) {
      const [from, to] = rule.replace;
      const fromId = invByName.get(key(from));
      const toId = invByName.get(key(to));
      if (fromId && toId) {
        // quantity_delta = 0: phép thay giữ nguyên lượng, không cộng thêm gì.
        values.push({
          modifier_id: mod.id,
          inventory_item_id: toId,
          quantity_delta: "0",
          replaces_item_id: fromId,
        });
      } else {
        missingIng.add(fromId ? to : from);
      }
    }

    for (const [ingName, delta] of rule.deltas ?? []) {
      const invId = invByName.get(key(ingName));
      if (!invId) {
        missingIng.add(ingName);
        continue;
      }
      values.push({
        modifier_id: mod.id,
        inventory_item_id: invId,
        quantity_delta: String(delta),
        replaces_item_id: null,
      });
    }

    if (values.length === 0) continue;
    await db.insert(schema.modifierIngredients).values(values);
    modDone++;
  }

  console.log(`  ✓ Chênh theo tùy chọn: ${modDone}/${rules.length} tùy chọn.`);
  if (missingMod.length) {
    console.log(`  · Không có tùy chọn này ở chi nhánh (bỏ qua): ${missingMod.join(" | ")}`);
  }
  reportMissingIngredients(missingIng);

  await detachDoDamFromLightItems(branchId, groups);
}

/**
 * Gỡ nhóm "Độ đậm" khỏi những món đã mang sẵn "(nhẹ)" trong tên.
 *
 * Vì sao: món "Cà phê đá (nhẹ)" có công thức nền đã là 1 shot (12g). Nếu vẫn cho
 * chọn thêm "Độ đậm — Nhẹ" thì delta −6g cộng vào lần nữa, còn 6g — trừ hai lần cho
 * một lần nhẹ. Món đã nhẹ sẵn thì không có gì để nhẹ thêm.
 *
 * Chỉ gỡ LIÊN KẾT món ↔ nhóm. Nhóm, tùy chọn và GIÁ giữ nguyên tuyệt đối — món
 * thường vẫn chọn "Nhẹ" bình thường.
 */
async function detachDoDamFromLightItems(
  branchId: string,
  groups: { id: string; name: string }[],
) {
  const doDam = groups.find((g) => g.name.trim().toLowerCase() === "độ đậm");
  if (!doDam) return;

  const lightRe = /\(\s*nh[eẹ]\s*\)/i;
  const menuRows = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.branch_id, branchId));

  const lightIds = menuRows.filter((m) => lightRe.test(m.name)).map((m) => m.id);
  if (lightIds.length === 0) return;

  const removed = await db
    .delete(schema.menuItemModifierGroups)
    .where(
      and(
        eq(schema.menuItemModifierGroups.group_id, doDam.id),
        inArray(schema.menuItemModifierGroups.item_id, lightIds),
      ),
    )
    .returning({ item_id: schema.menuItemModifierGroups.item_id });

  if (removed.length > 0) {
    console.log(
      `  ✓ Gỡ nhóm "Độ đậm" khỏi ${removed.length} món đã là "(nhẹ)" — để nhẹ chỉ trừ một lần.`,
    );
  }
}

function reportMissingIngredients(missing: Set<string>) {
  if (missing.size === 0) return;
  console.log(
    `  ⚠ Thiếu nguyên liệu (chạy setup-toda-inventory.ts trước?): ${[...missing].join(", ")}`,
  );
}

async function main() {
  console.log("📐 Nạp công thức định lượng từ SOP...");
  const branches = await db
    .select({ id: schema.branches.id, name: schema.branches.name })
    .from(schema.branches);

  for (const b of branches) {
    console.log(`\n== Chi nhánh: ${b.name} ==`);
    await setupForBranch(b.id);
  }
  console.log("\n🎉 Hoàn tất. Món chưa có định lượng sẽ hiện badge \"Chưa có công thức\".");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
