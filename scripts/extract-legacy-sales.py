#!/usr/bin/env python3
"""Trích dữ liệu bán hàng từ bản xuất Excel của POS cũ ra NDJSON.

    python scripts/extract-legacy-sales.py [thư-mục-vào] [thư-mục-ra]

Mặc định đọc ./data_old và ghi ./data_old/extracted.

Vì sao tự đọc xlsx thay vì dùng openpyxl/pandas: hai file này KHÔNG có
xl/sharedStrings.xml (chuỗi nằm nội tuyến trong <is><t>), nên chỉ cần zipfile +
re của thư viện chuẩn. Thêm phụ thuộc nặng cho một script chạy đúng một lần là
không đáng — nhất là khi máy chạy chưa cài sẵn.

Kết quả (tiền để nguyên ĐỒNG, việc nhân 100 thành cents do import-legacy-sales.ts lo):
  legacy-daily.ndjson  {"date","revenue","orderCount"}
  legacy-items.ndjson  {"date","code","name","group","unit","quantity","revenue"}

⚠️ Chạy trên Windows nhớ đặt PYTHONIOENCODING=utf-8, console mặc định cp1252 sẽ
nổ UnicodeEncodeError khi in tên món tiếng Việt.
"""

import datetime
import json
import os
import re
import sys
import zipfile

EXCEL_EPOCH = datetime.date(1899, 12, 30)

CELL_RE = re.compile(r'<c r="([A-Z]+)(\d+)"[^>]*?>(.*?)</c>', re.S)
ROW_RE = re.compile(r"<row[^>]*>(.*?)</row>", re.S)
TEXT_RE = re.compile(r"<t[^>]*>(.*?)</t>", re.S)
VALUE_RE = re.compile(r"<v>(.*?)</v>", re.S)

XML_ENTITIES = (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"))
ZERO_WIDTH = chr(0x200B)


def col_index(letters: str) -> int:
    """'A' -> 1, 'N' -> 14, 'AA' -> 27."""
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def clean(s: str) -> str:
    for a, b in XML_ENTITIES:
        s = s.replace(a, b)
    # ZERO_WIDTH rải khắp bản xuất — trông như không có gì nhưng dính vào là nhận dạng
    # ngày và so tên món trượt hết. Dùng chr() chứ đừng dán ký tự thật vào mã nguồn:
    # nhìn không thấy, ai sửa sau cũng không biết nó ở đó.
    return s.replace(ZERO_WIDTH, "").strip()


def parse_row(body: str) -> dict[int, str]:
    """Trả về {chỉ-số-cột: giá-trị}.

    Đọc theo thuộc tính r= của từng ô chứ KHÔNG đếm tuần tự: Excel lược bỏ ô rỗng,
    đếm tuần tự là lệch cột ngay khi có một ngày nào đó không bán món nào.
    """
    out: dict[int, str] = {}
    for m in CELL_RE.finditer(body):
        letters, _rownum, inner = m.groups()
        text = TEXT_RE.search(inner)
        if text:
            out[col_index(letters)] = clean(text.group(1))
            continue
        # Bản xuất này để tiêu đề ngày ở dạng t="str" → chữ nằm trong <v> chứ không
        # phải <t>. Nên nhánh này cũng phải clean(), không thì ZERO_WIDTH lọt qua và
        # mọi cột ngày bị bỏ hết (im lặng, ra 0 dòng).
        val = VALUE_RE.search(inner)
        if val:
            out[col_index(letters)] = clean(val.group(1))
    return out


def num(raw: str | None) -> float:
    if not raw or raw in ("-", ""):
        return 0.0
    try:
        return float(raw)
    except ValueError:
        return 0.0


def sheet_rows(zf: zipfile.ZipFile, name: str):
    """Duyệt từng hàng. Dùng finditer chứ không findall — sheet1 nặng 41MB."""
    xml = zf.read(name).decode("utf-8")
    for m in ROW_RE.finditer(xml):
        yield parse_row(m.group(1))


# --------------------------------------------------------------------------
# 1. Doanh thu theo ngày  (sale_summary_report.xlsx, sheet1)
# --------------------------------------------------------------------------
def extract_daily(path: str) -> list[dict]:
    rows: list[dict] = []
    with zipfile.ZipFile(path) as zf:
        for cells in sheet_rows(zf, "xl/worksheets/sheet1.xml"):
            serial = cells.get(1, "")
            # Cột A của dòng dữ liệu là số sê-ri Excel (vd 45870.2917); dòng tiêu đề
            # là chữ nên không lọt qua được.
            if not re.match(r"^\d{5}(\.\d+)?$", serial):
                continue
            day = EXCEL_EPOCH + datetime.timedelta(days=int(float(serial)))
            rows.append(
                {
                    "date": day.isoformat(),
                    "revenue": int(num(cells.get(2))),
                    "orderCount": int(num(cells.get(3))),
                }
            )
    return rows


# --------------------------------------------------------------------------
# 2. Món × ngày  (items_report.xlsx, sheet1)
# --------------------------------------------------------------------------
# Mỗi ngày chiếm 8 cột liên tiếp, bắt đầu từ cột N (=14):
#   +0 Đã bán | +1 Hoa hồng | +2 Giảm giá (merchant) | +3 Giảm giá (đối tác)
#   +4 Thuế khấu trừ | +5 Doanh thu (net) | +6 Doanh thu (gross) | +7 Giá trung bình
# (gross − net = giảm giá; 24/359 ngày có chênh, tổng 495.000đ cả năm)
FIRST_DATE_COL = 14
COLS_PER_DATE = 8
OFFSET_QUANTITY = 0
# Lấy NET chứ không phải GROSS: gross là giá niêm yết chưa trừ giảm giá, cộng cả năm
# ra 918.003.500đ — lệch 495.000đ so với báo cáo doanh thu theo ngày. Net khớp đúng
# 917.508.500đ, tức chính con số quán vẫn dùng. Hai bảng lịch sử phải cùng một thước.
OFFSET_REVENUE_NET = 5


def extract_items(path: str) -> tuple[list[dict], int]:
    """Trả về (danh sách dòng, số dòng đã gộp).

    Gộp theo (ngày, tên món): nhóm "Món tuỳ chọn" của hệ cũ là chỗ nhân viên gõ tay
    nên cùng một tên xuất hiện nhiều dòng với mã khác nhau (vd 'đá chanh' 14.000đ và
    15.000đ trong cùng một ngày). Bảng lịch sử khoá duy nhất theo (chi nhánh, ngày,
    tên món, nguồn) — không gộp thì `ON CONFLICT DO NOTHING` sẽ NUỐT MẤT dòng thứ hai
    mà không báo gì, và tổng doanh thu hụt đi.
    """
    out: list[dict] = []
    with zipfile.ZipFile(path) as zf:
        dates: list[tuple[str, int]] = []
        for rownum, cells in enumerate(sheet_rows(zf, "xl/worksheets/sheet1.xml"), start=1):
            # Hàng 2 = tên ngày. Hàng 3 = tên cột con, bỏ qua.
            if rownum == 2:
                dates = [
                    (parse_date(v), c)
                    for c, v in sorted(cells.items())
                    if c >= FIRST_DATE_COL and parse_date(v)
                ]
                continue
            if rownum <= 3 or not dates:
                continue

            name = cells.get(2, "")
            # Dòng tổng theo nhóm không có tên món ở cột B; dòng "Tổng" là tổng toàn báo cáo.
            if not name or name == "Tổng":
                continue

            code = cells.get(1, "") or None
            group = cells.get(4, "") or None
            unit = cells.get(3, "") or None

            for iso, base in dates:
                qty = num(cells.get(base + OFFSET_QUANTITY))
                if qty == 0:
                    continue
                out.append(
                    {
                        "date": iso,
                        "code": code,
                        "name": name,
                        "group": group,
                        "unit": unit,
                        "quantity": round(qty, 3),
                        "revenue": int(num(cells.get(base + OFFSET_REVENUE_NET))),
                    }
                )

    merged: dict[tuple[str, str], dict] = {}
    for row in out:
        key = (row["date"], row["name"])
        prev = merged.get(key)
        if prev is None:
            merged[key] = row
            continue
        prev["quantity"] = round(prev["quantity"] + row["quantity"], 3)
        prev["revenue"] += row["revenue"]
    return list(merged.values()), len(out) - len(merged)


def parse_date(raw: str) -> str | None:
    """'01/08/2025' -> '2025-08-01'. Trả None nếu không phải ngày."""
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", (raw or "").strip())
    if not m:
        return None
    d, mo, y = m.groups()
    return f"{y}-{mo}-{d}"


def write_ndjson(path: str, rows: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else "data_old"
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, "extracted")

    summary_xlsx = os.path.join(src, "sale_summary_report.xlsx")
    items_xlsx = os.path.join(src, "items_report.xlsx")
    for p in (summary_xlsx, items_xlsx):
        if not os.path.exists(p):
            print(f"Không thấy {p}", file=sys.stderr)
            return 1

    os.makedirs(dst, exist_ok=True)

    print("Đang đọc doanh thu theo ngày…")
    daily = extract_daily(summary_xlsx)
    write_ndjson(os.path.join(dst, "legacy-daily.ndjson"), daily)

    print("Đang đọc món × ngày (file 83MB, hơi lâu)…")
    items, merged_count = extract_items(items_xlsx)
    write_ndjson(os.path.join(dst, "legacy-items.ndjson"), items)

    # Đối chiếu ngay tại chỗ: hai nguồn phải khớp tổng, lệch là bóc sai cột.
    rev_daily = sum(r["revenue"] for r in daily)
    rev_items = sum(r["revenue"] for r in items)
    print()
    print(f"  Ngày        : {len(daily):>7,} dòng  {daily[0]['date']} → {daily[-1]['date']}")
    print(f"  Món × ngày  : {len(items):>7,} dòng (đã gộp {merged_count} dòng trùng tên trong cùng ngày)")
    print(f"  Tổng (ngày) : {rev_daily:>15,}đ")
    print(f"  Tổng (món)  : {rev_items:>15,}đ")
    diff = rev_items - rev_daily
    pct = (diff / rev_daily * 100) if rev_daily else 0
    print(f"  Lệch        : {diff:>15,}đ ({pct:+.2f}%)")
    if abs(pct) > 1:
        print("  ⚠️  Lệch quá 1% — kiểm tra lại việc bóc cột trước khi nhập.")
    print()
    print(f"Đã ghi vào {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
