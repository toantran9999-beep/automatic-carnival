#!/usr/bin/env bash
# Đếm số dòng code CÒN LÀ CỦA TÁC GIẢ GỐC RestAI (Vicenzo) trong repo — thước đo
# của việc viết lại (xong = 0). Lý do: repo gốc github.com/EijunnN/restai không
# có giấy phép; anh Toàn chốt 28/10/2026 viết lại dần, bỏ hết code gốc.
#
#   bash scripts/dem-code-goc.sh            # in tổng + theo khu
#   bash scripts/dem-code-goc.sh --file     # in thêm từng file (nhiều → ít)
#
# Quét MỌI file trong git (không chỉ .ts) trừ lockfile và file nhị phân.
# `git blame -w` bỏ qua thay đổi chỉ khoảng trắng/CRLF — đổi thụt lề không tính là viết lại.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
git ls-files | grep -vE '(^|/)bun\.lock$|\.(png|jpe?g|webp|gif|ico|svg|woff2?|ttf|mp3|wav|apk|jar|keystore|p12)$' \
  | while IFS= read -r f; do
      n=$(git blame --line-porcelain -w HEAD -- "$f" 2>/dev/null | grep -c '^author Vicenzo$' || true)
      [ "${n:-0}" -gt 0 ] && printf '%s\t%s\n' "$n" "$f"
    done | sort -rn > "$TMP"

khu() {
  case "$1" in
    *"(customer)"*|*routes/customer*|*customer-auth*|*stores/customer*) echo "Khách tự gọi QR" ;;
    *loyalty*|*coupon*) echo "Tích điểm / coupon" ;;
    *kitchen*|*kds*) echo "Bếp / KDS" ;;
    *reservation*|*calendar*|*delivery*|*notification*) echo "Đặt chỗ / thông báo / lịch" ;;
    *table*|*spaces*) echo "Bàn ăn" ;;
    *inventory*|*recipe*) echo "Kho" ;;
    *menu*|*product*|*categor*|*modifier*) echo "Menu" ;;
    *auth*|*staff*|*login*|*register*|*middleware*|*proxy*|*session*|*jwt*|*hash*) echo "Auth / nhân viên" ;;
    *order*|*/pos/*|*payment*|*invoice*|*cart*) echo "Đơn / POS / thanh toán" ;;
    *report*|*dashboard/page*|*dashboard/_comp*|*settings*|*branch*|*organization*|*orgs*) echo "Báo cáo / cài đặt" ;;
    *.sql|*drizzle/meta*) echo "Migration SQL" ;;
    apps/*|packages/*) echo "Khung, WS, lib, UI chung, gói chung" ;;
    *) echo "Cấu hình / tài liệu gốc repo" ;;
  esac
}

TONG=$(awk -F'\t' '{s+=$1} END{print s+0}' "$TMP")
SOFILE=$(wc -l < "$TMP" | tr -d ' ')
echo "Code gốc còn lại: $TONG dòng trong $SOFILE file  (HEAD $(git rev-parse --short HEAD), $(date +%F))"
echo
while IFS=$'\t' read -r n f; do printf '%s\t%s\n' "$(khu "$f")" "$n"; done < "$TMP" \
  | awk -F'\t' '{s[$1]+=$2; c[$1]++} END{for(k in s) printf "%7d dòng %4d file  %s\n", s[k], c[k], k}' | sort -rn

if [ "${1:-}" = "--file" ]; then echo; awk -F'\t' '{printf "%6d  %s\n", $1, $2}' "$TMP"; fi
