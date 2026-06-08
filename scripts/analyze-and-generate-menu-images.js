const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "data", "update-item.xlsx");
const outDir = path.join(root, "data", "generated-menu-images");
const reportPath = path.join(root, "data", "menu-analysis-report.md");
const csvPath = path.join(root, "data", "menu-image-missing.csv");
const outputXlsx = path.join(root, "data", "update-item.with-generated-images.xlsx");

fs.mkdirSync(outDir, { recursive: true });

const wb = XLSX.readFile(inputPath, { cellDates: true });
const ws = wb.Sheets.Menu;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

function clean(value) {
  return String(value ?? "").trim();
}

function hasValidImage(value) {
  const image = clean(value);
  return /^https?:\/\//i.test(image);
}

function slugify(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "item";
}

function xmlEscape(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemKind(item) {
  const group = item.group.toLowerCase();
  const type = item.type.toLowerCase();
  const name = item.name.toLowerCase();
  if (group.includes("đường") || group.includes("duong")) return "Tùy chọn";
  if (group.includes("uncategory")) return "Tùy chọn";
  if (group.includes("thuốc") || group.includes("thuoc")) return "Tùy chọn / hàng phụ";
  if (!type && /^(thêm|them|ít|it|nhiều|nhieu|không|khong|rất|rat|nóng|nong|đá|da)/i.test(name)) {
    return "Tùy chọn";
  }
  return "Món chính";
}

function paletteFor(item) {
  const group = item.group.toLowerCase();
  const name = item.name.toLowerCase();
  if (group.includes("cà phê") || group.includes("ca phe")) {
    return ["#3A2418", "#8C5A3C", "#E8D3B9", "#FFF7ED"];
  }
  if (group.includes("sinh") || group.includes("đá xay") || group.includes("da xay")) {
    return ["#1B5E4B", "#5EC9A6", "#F6D86B", "#F7FFF8"];
  }
  if (name.includes("trà") || name.includes("tra")) {
    return ["#174A3A", "#61A96F", "#F5DA7A", "#FAFFF5"];
  }
  if (name.includes("soda") || name.includes("cam") || name.includes("chanh")) {
    return ["#17405A", "#42B7C8", "#FFE16B", "#F3FDFF"];
  }
  if (group.includes("đường") || group.includes("duong")) {
    return ["#5B4B2F", "#D8B35A", "#FFF2C6", "#FFFDF4"];
  }
  return ["#263238", "#78909C", "#ECEFF1", "#FFFFFF"];
}

function iconFor(item) {
  const name = item.name.toLowerCase();
  const group = item.group.toLowerCase();
  if (name.includes("espresso")) return "☕";
  if (group.includes("cà phê") || group.includes("ca phe") || name.includes("cà phê")) return "☕";
  if (name.includes("matcha") || name.includes("trà") || name.includes("tra")) return "🍵";
  if (name.includes("soda")) return "🥤";
  if (name.includes("cam") || name.includes("chanh") || name.includes("tắc")) return "🍋";
  if (name.includes("sữa chua") || name.includes("sinh tố")) return "🥛";
  if (group.includes("đường") || group.includes("duong")) return "⚙";
  if (group.includes("thuốc") || group.includes("thuoc")) return "▣";
  return "☕";
}

function splitTitle(name) {
  const words = clean(name).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function svgFor(item) {
  const [dark, mid, accent, bg] = paletteFor(item);
  const titleLines = splitTitle(item.name);
  const groupLabel = clean(item.group || item.type || "Toda Café");
  const price = Number(clean(item.price).replace(/[^\d]/g, ""));
  const priceLabel = price ? new Intl.NumberFormat("vi-VN").format(price) + "đ" : "";
  const icon = iconFor(item);
  const titleSvg = titleLines
    .map((line, index) => `<text x="300" y="${292 + index * 43}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${titleLines.length > 2 ? 34 : 38}" font-weight="800" fill="${dark}">${xmlEscape(line)}</text>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="55%" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${mid}" stop-opacity="0.25"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="600" height="600" rx="56" fill="url(#bg)"/>
  <circle cx="502" cy="94" r="118" fill="${mid}" opacity="0.18"/>
  <circle cx="90" cy="508" r="132" fill="${dark}" opacity="0.08"/>
  <rect x="86" y="94" width="428" height="322" rx="42" fill="#ffffff" opacity="0.74" filter="url(#shadow)"/>
  <circle cx="300" cy="197" r="74" fill="${dark}" opacity="0.96"/>
  <text x="300" y="222" text-anchor="middle" font-family="Arial, sans-serif" font-size="76" fill="#ffffff">${xmlEscape(icon)}</text>
  ${titleSvg}
  <text x="300" y="444" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${mid}">${xmlEscape(groupLabel)}</text>
  <text x="300" y="491" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="${dark}">${xmlEscape(priceLabel)}</text>
  <text x="300" y="548" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${dark}" opacity="0.72">TODA CAFÉ</text>
</svg>`;
}

const items = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const name = clean(row[3]);
  if (!name) continue;
  items.push({
    excelRow: i + 1,
    row,
    id: clean(row[0]),
    code: clean(row[1]),
    name,
    price: clean(row[4]),
    groupCode: clean(row[11]),
    group: clean(row[12]),
    typeCode: clean(row[13]),
    type: clean(row[14]),
    image: clean(row[26]),
  });
}

const byGroup = new Map();
const byKind = new Map();
const missing = [];
for (const item of items) {
  const kind = itemKind(item);
  item.kind = kind;
  byGroup.set(item.group || "(trống)", (byGroup.get(item.group || "(trống)") || 0) + 1);
  byKind.set(kind, (byKind.get(kind) || 0) + 1);
  if (!hasValidImage(item.image)) missing.push(item);
}

for (const item of missing) {
  const fileName = `${String(item.excelRow).padStart(3, "0")}-${slugify(item.code || item.name)}.svg`;
  const relPath = `generated-menu-images/${fileName}`;
  const absPath = path.join(outDir, fileName);
  fs.writeFileSync(absPath, svgFor(item), "utf8");
  item.generatedImage = relPath;
  rows[item.excelRow - 1][26] = relPath;
}

const newWs = XLSX.utils.aoa_to_sheet(rows);
wb.Sheets.Menu = newWs;
XLSX.writeFile(wb, outputXlsx);

const csvLines = [
  "excelRow,code,name,group,type,kind,oldImage,generatedImage",
  ...missing.map((item) => [
    item.excelRow,
    item.code,
    item.name,
    item.group,
    item.type,
    item.kind,
    item.image,
    item.generatedImage,
  ].map((v) => `"${clean(v).replace(/"/g, '""')}"`).join(",")),
];
fs.writeFileSync(csvPath, csvLines.join("\n"), "utf8");

const report = [];
report.push("# Toda POS Menu Analysis");
report.push("");
report.push(`Source: \`${path.relative(root, inputPath)}\``);
report.push(`Generated workbook: \`${path.relative(root, outputXlsx)}\``);
report.push(`Generated images folder: \`${path.relative(root, outDir)}\``);
report.push("");
report.push("## Summary");
report.push("");
report.push(`- Total menu rows: ${items.length}`);
report.push(`- Main items: ${byKind.get("Món chính") || 0}`);
report.push(`- Option/add-on items: ${(byKind.get("Tùy chọn") || 0) + (byKind.get("Tùy chọn / hàng phụ") || 0)}`);
report.push(`- Missing/bad image rows fixed locally: ${missing.length}`);
report.push("");
report.push("## Groups");
report.push("");
for (const [group, count] of [...byGroup.entries()].sort((a, b) => b[1] - a[1])) {
  report.push(`- ${group}: ${count}`);
}
report.push("");
report.push("## Main vs Option Rule");
report.push("");
report.push("- Main items: drink/product groups such as `CÀ PHÊ`, `SINH TỐ & ĐÁ XAY`, `TRÀ & MÓN KHÁC`, and coffee bean products.");
report.push("- Options/add-ons: `Đường sữa`, `Uncategory` add-ons, and `Thuốc lá`/auxiliary goods.");
report.push("");
report.push("## Missing Images Generated");
report.push("");
report.push("| Row | Code | Name | Group | Kind | Generated image |");
report.push("|---:|---|---|---|---|---|");
for (const item of missing) {
  report.push(`| ${item.excelRow} | ${item.code} | ${item.name} | ${item.group} | ${item.kind} | ${item.generatedImage} |`);
}
report.push("");
fs.writeFileSync(reportPath, report.join("\n"), "utf8");

console.log(JSON.stringify({
  totalItems: items.length,
  groups: Object.fromEntries(byGroup),
  kinds: Object.fromEntries(byKind),
  missingImagesGenerated: missing.length,
  outputXlsx,
  reportPath,
  csvPath,
  outDir,
}, null, 2));
