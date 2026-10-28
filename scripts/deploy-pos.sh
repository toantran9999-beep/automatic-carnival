#!/usr/bin/env bash
# Đưa TODA POS lên VPS — chạy từ Git Bash trên máy Windows, thư mục restai/.
#
#   bash scripts/deploy-pos.sh         # MẶC ĐỊNH: kiểm repo → push → xem trước những gì
#                                      # cron 22h sẽ tự đưa lên (KHÔNG đụng POS đang chạy)
#   bash scripts/deploy-pos.sh --now   # deploy NGAY — CHỈ khi anh Toàn nói rõ "deploy ngay"
#
# Anh Toàn chốt 28/10/2026: không deploy giữa giờ bán. Ban ngày chỉ push; VPS tự
# deploy lúc 22h (scripts/vps-deploy.sh --nightly, báo kết quả qua Telegram).
# Phần chạy trên VPS nằm hết ở scripts/vps-deploy.sh — sửa logic deploy thì sửa ở đó.
set -euo pipefail

NOW=0
case "${1:-}" in
  "") ;;
  --now) NOW=1 ;;
  *) echo "Chỉ nhận --now" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/../.vps.env"
HOSTKEY="ssh-ed25519 255 SHA256:TCjWFSdRmgxdH+DghQ8atge7oCePheLFuv6f/pK6XGM"
cd "$ROOT"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

say "Kiểm repo local"
[ "$(git rev-parse --abbrev-ref HEAD)" = "master" ] || die "Không ở nhánh master — VPS chỉ theo master."
dirty=$(git status --porcelain --untracked-files=no)
if [ -n "$dirty" ]; then
  echo "$dirty"
  die "Còn file đã theo dõi chưa commit (ở trên). Commit đúng file của mình hoặc để phiên kia xong."
fi
untracked=$(git status --porcelain | grep '^??' || true)
[ -n "$untracked" ] && printf 'ℹ️  File chưa theo dõi (KHÔNG lên VPS, để nguyên):\n%s\n' "$untracked"

say "Push lên GitHub"
git fetch -q origin master
[ -z "$(git rev-list HEAD..origin/master)" ] || die "origin/master có commit local chưa có — git pull trước đã."
if [ -n "$(git rev-list origin/master..HEAD)" ]; then git push -q origin master; echo "Đã push."; else echo "GitHub đã có HEAD này."; fi

[ -f "$ENVF" ] || die "Không thấy $ENVF"
PW=$(mktemp); trap 'rm -f "$PW"' EXIT
grep -E '^VPS_PASSWORD=' "$ENVF" | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//' | tr -d '\r\n' > "$PW"
[ -s "$PW" ] || die "Không đọc được VPS_PASSWORD trong .vps.env"
VPS_USER=$(grep -E '^VPS_USER=' "$ENVF" | sed -E 's/^[^=]+=//; s/"//g' | tr -d '\r\n')
VPS_HOST=$(grep -E '^VPS_HOST=' "$ENVF" | sed -E 's/^[^=]+=//; s/"//g' | tr -d '\r\n')

# Luôn chạy bản vps-deploy.sh ĐÃ COMMIT (lấy từ origin/master ra /tmp), giống cron.
BOOT='cd /root/toda-pos && git fetch -q origin && git show origin/master:scripts/vps-deploy.sh > /tmp/toda-pos-vps-deploy.sh && bash /tmp/toda-pos-vps-deploy.sh'
if [ "$NOW" = 1 ]; then
  say "Deploy NGAY trên VPS"
  plink -batch -hostkey "$HOSTKEY" -pwfile "$PW" "$VPS_USER@$VPS_HOST" "$BOOT --now"
else
  say "Xem trước — 22h VPS sẽ tự đưa lên:"
  plink -batch -hostkey "$HOSTKEY" -pwfile "$PW" "$VPS_USER@$VPS_HOST" "$BOOT --dry-run"
  echo
  echo "✅ Đã xếp lịch. 22h VPS tự deploy (chờ job AI đêm xong), kết quả nhắn Telegram qua @todaadsbot."
fi
