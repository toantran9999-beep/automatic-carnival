#!/usr/bin/env bash
# Deploy TODA POS — chạy TRÊN VPS (/root/toda-pos). Dùng chung cho:
#   --nightly   cron 22h: chờ job AI lọc đêm của toda-agent xong rồi mới build, báo Telegram
#   --now       deploy ngay (CHỈ khi anh Toàn nói rõ "deploy ngay"), báo Telegram
#   --dry-run   chỉ in sẽ lên commit nào, build dịch vụ nào — không pull, không build
#   --dry-run --gia-lap-hong   in thêm đường quay về khi tự kiểm hỏng (vẫn không làm gì)
#
# Vì sao 22h: anh Toàn chốt 28/10/2026 — không deploy giữa giờ bán (container
# khởi động lại, máy quầy phải tải lại, phiếu đang in có thể mất).
#
# Cron KHÔNG gọi thẳng file này trong repo mà lấy bản đã commit ra /tmp:
#   0 22 * * * cd /root/toda-pos && git fetch -q origin && git show origin/master:scripts/vps-deploy.sh > /tmp/toda-pos-vps-deploy.sh && bash /tmp/toda-pos-vps-deploy.sh --nightly
# → git pull không sửa script đang chạy, và luôn chạy bản mới nhất.
set -uo pipefail

REPO=/root/toda-pos
LOG=/var/log/toda-pos-deploy.log
LOC_LOCK=/tmp/toda-loc.lock          # khoá của toda-agent/nightly/chay-loc.sh (job AI 22h)
RELEASE_URL="https://github.com/toantran9999-beep/automatic-carnival/releases/tag/pos-apk-latest"

MODE=""; DRY=0; GIA_LAP_HONG=0
for a in "$@"; do
  case "$a" in
    --nightly) MODE=nightly ;;
    --now) MODE=now ;;
    --dry-run) DRY=1 ;;
    --gia-lap-hong) GIA_LAP_HONG=1 ;;
    *) echo "Không hiểu tham số: $a" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || [ "$DRY" = 1 ] || { echo "Cần --nightly, --now hoặc --dry-run" >&2; exit 2; }

# Dry-run chỉ in ra màn hình; chạy thật thì ghi cả vào log.
if [ "$DRY" = 0 ]; then exec > >(tee -a "$LOG") 2>&1; fi
log() { echo "[$(date '+%F %T')] $*"; }

exec 8>/tmp/toda-pos-deploy.lock
flock -n 8 || { log "Đang có lượt deploy khác chạy — bỏ qua."; exit 0; }

# ---------- Telegram: bot nội bộ @todaadsbot → mọi admin đang hoạt động ----------
notify() {
  [ "$DRY" = 1 ] && { echo "---- (dry-run) tin Telegram sẽ gửi:"; echo "$1"; echo "----"; return; }
  local token ids id
  token=$(grep -E '^TELEGRAM_BOT_TOKEN=' /root/toda-agent/.env 2>/dev/null | cut -d= -f2- | tr -d '"\r')
  ids=$(docker exec toda_postgres psql -U toda_user -d toda_lich -tAc \
        "select telegram_id from nhan_su where active and vai_tro='admin' and telegram_id is not null" < /dev/null 2>/dev/null)
  if [ -z "$token" ] || [ -z "$ids" ]; then log "⚠️ Không gửi được Telegram (thiếu token hoặc chat admin)"; return; fi
  for id in $ids; do
    curl -4 -s -m 15 "https://api.telegram.org/bot$token/sendMessage" \
      --data-urlencode "chat_id=$id" --data-urlencode "text=$1" > /dev/null \
      || log "⚠️ Gửi Telegram tới 1 admin thất bại"
  done
}

cd "$REPO" || { log "Không vào được $REPO"; exit 1; }
git fetch -q origin master || { notify "❌ POS 22h: không fetch được GitHub — tối nay chưa deploy."; exit 1; }

OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/master)
if [ "$OLD" = "$NEW" ]; then
  log "Không có commit mới (VPS đã ở $(git log --oneline -1 | cut -c1-60))."
  exit 0
fi
if ! git merge-base --is-ancestor "$OLD" "$NEW"; then
  notify "❌ POS 22h: VPS có commit mà GitHub không có ($(git rev-parse --short HEAD)) — không fast-forward được, chưa deploy. Cần xử lý tay."
  exit 1
fi

COMMITS=$(git log --format='• %h %s' "$OLD..$NEW" | cut -c1-110)
CHANGED=$(git diff --name-only "$OLD" "$NEW")

# File đang sửa tay trên VPS (vd Caddyfile) mà commit mới cũng đụng → dừng, không đè.
LOCAL_MOD=$(git diff --name-only)
CLASH=$(comm -12 <(echo "$CHANGED" | sort) <(echo "$LOCAL_MOD" | sort) | grep -v '^$' || true)
if [ -n "$CLASH" ]; then
  notify "❌ POS 22h: commit mới sửa file đang sửa tay trên VPS: $CLASH — không đè, chưa deploy. Cần gộp tay."
  exit 1
fi

# Chọn dịch vụ cần build theo file đổi.
need() { echo "$CHANGED" | grep -qE "$1"; }
SERVICES=""
need '^(apps/api/|packages/|Dockerfile\.api|bun\.lock|package\.json|turbo\.json|docker-compose\.yml)' && SERVICES="$SERVICES api"
need '^(apps/web/|packages/|Dockerfile\.web|bun\.lock|package\.json|turbo\.json|docker-compose\.yml)' && SERVICES="$SERVICES web"
NEED_MIGRATE=0
need '^packages/db/drizzle/' && { NEED_MIGRATE=1; SERVICES="$SERVICES migrate"; }
SERVICES=$(echo $SERVICES)
CHECK_SERVICES=$(echo "$SERVICES" | sed 's/migrate//' | xargs)

APK_NOTE=""
if need '^pos-android/'; then
  VER=$(git show "$NEW:pos-android/app/build.gradle" 2>/dev/null | grep -oE 'versionName "[^"]+"' | cut -d'"' -f2)
  APK_NOTE="📱 Có APK máy quầy mới${VER:+ v$VER} — cài SAU GIỜ ĐÓNG CỬA (Android bắt buộc bấm tay): $RELEASE_URL"
fi

# Journal phải khớp số .sql ở bản SẮP lên (kiểm trước khi đụng gì).
J=$(git show "$NEW:packages/db/drizzle/meta/_journal.json" | grep -c '"tag"')
S=$(git ls-tree --name-only "$NEW" packages/db/drizzle/ | grep -c '\.sql$')
if [ "$J" != "$S" ]; then
  notify "❌ POS 22h: journal $J mục nhưng $S file .sql — migrate sẽ bỏ sót. Chưa deploy."
  exit 1
fi

log "Sẽ lên $(git rev-parse --short "$OLD")..$(git rev-parse --short "$NEW"), build: ${SERVICES:-(không cần build)}"
echo "$COMMITS"

if [ "$DRY" = 1 ]; then
  echo "(dry-run) Không pull, không build."
  if [ "$GIA_LAP_HONG" = 1 ]; then
    if [ "$NEED_MIGRATE" = 1 ]; then
      echo "(dry-run) Nếu tự kiểm hỏng: có migration → KHÔNG tự quay về, chỉ báo động để xử lý tay."
    else
      echo "(dry-run) Nếu tự kiểm hỏng: git reset --keep $(git rev-parse --short "$OLD") → build lại [${SERVICES}] → up -d → kiểm lại → báo Telegram."
    fi
    notify "⚠️ POS 22h: tự kiểm HỎNG (giả lập) — đã quay về $(git rev-parse --short "$OLD")."
  fi
  [ -n "$APK_NOTE" ] && echo "$APK_NOTE"
  exit 0
fi

# Đêm: chờ job AI lọc của toda-agent (cũng chạy 22h) xong rồi mới build — build web
# ăn 2–3GB RAM, chạy chồng trên VPS 4GB dễ bị giết. Ngủ trước để nó kịp giữ khoá,
# rồi chờ khoá nhả (tối đa 90 phút; quá thì vẫn deploy — quán đã đóng cửa).
if [ "$MODE" = nightly ]; then
  sleep 90
  log "Chờ job AI lọc đêm nhả khoá…"
  flock -w 5400 "$LOC_LOCK" true || log "Chờ quá 90 phút — deploy luôn."
fi

git merge --ff-only -q "$NEW" || { notify "❌ POS 22h: git merge thất bại — chưa deploy."; exit 1; }

if [ -z "$SERVICES" ]; then
  log "Chỉ đổi tài liệu/script — không build. VPS nay ở $(git rev-parse --short HEAD)."
  [ -n "$APK_NOTE" ] && notify "$APK_NOTE"
  exit 0
fi

PSQL="docker compose exec -T postgres psql -U toda -d restai -tAc"
count_mig() { $PSQL "select count(*) from drizzle.__drizzle_migrations" < /dev/null 2>/dev/null | tr -d ' ' || echo "?"; }

build_up() {
  # Build lỗi mà vẫn up thì container chạy ẢNH CŨ, healthy như thường → báo OK sai.
  docker compose build $SERVICES > /tmp/toda-pos-build.log 2>&1 || return 1
  docker compose up -d $SERVICES 2>&1 | tail -4
}

self_check() {
  local ok=1 bad st i code
  for i in $(seq 1 40); do
    bad=""
    for s in $CHECK_SERVICES; do
      st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "toda-pos-$s-1" 2>/dev/null || echo missing)
      [ "$st" = healthy ] || [ "$st" = running ] || bad="$bad $s=$st"
    done
    [ -z "$bad" ] && break; sleep 3
  done
  [ -z "$bad" ] && log "✅ Container: $CHECK_SERVICES" || { log "❌ Container chưa lên:$bad"; ok=0; }
  local after; after=$(count_mig)
  [ "$after" = "$J" ] && log "✅ Migration DB $after = journal $J" || { log "❌ Migration DB $after ≠ journal $J"; ok=0; }
  docker compose exec -T api wget -qO- http://localhost:3001/health < /dev/null > /dev/null 2>&1 \
    && log "✅ API /health" || { log "❌ API /health không trả lời"; ok=0; }
  code=$(curl -4 -s -o /dev/null -m 15 -w '%{http_code}' https://pos.14.225.212.172.nip.io/ || echo 000)
  case "$code" in 200|30?) log "✅ Web qua Caddy: $code";; *) log "❌ Web qua Caddy: $code"; ok=0;; esac
  [ "$ok" = 1 ]
}

log "Build: $SERVICES"
if ! build_up; then
  tail -20 /tmp/toda-pos-build.log
  git reset -q --keep "$OLD"   # HEAD về như cũ để tối sau thử lại; giữ sửa tay (Caddyfile)
  notify "❌ POS 22h: BUILD LỖI — chưa up gì, bản đang chạy giữ nguyên ($(git rev-parse --short "$OLD")). Tối mai tự thử lại; xem $LOG.
$(tail -3 /tmp/toda-pos-build.log)"
  exit 1
fi

if self_check; then
  notify "✅ POS đã lên bản mới lúc $(date +%H:%M) (build: $SERVICES)
$COMMITS${APK_NOTE:+

$APK_NOTE}"
  exit 0
fi

# Tự kiểm hỏng.
if [ "$NEED_MIGRATE" = 1 ]; then
  notify "🚨 POS 22h: tự kiểm HỎNG sau khi chạy migration — KHÔNG tự quay về (DB đã đổi). Cần xử lý tay trước giờ mở cửa. Log: $LOG"
  exit 1
fi
log "Tự kiểm hỏng → quay về $(git rev-parse --short "$OLD")"
git reset -q --keep "$OLD"
if build_up && self_check; then
  notify "⚠️ POS 22h: bản mới tự kiểm HỎNG → đã QUAY VỀ bản cũ $(git rev-parse --short "$OLD"), quầy chạy bình thường. Commit lỗi:
$COMMITS"
else
  notify "🚨 POS 22h: bản mới hỏng VÀ quay về cũng chưa lên — cần xử lý tay trước giờ mở cửa. Log: $LOG"
fi
exit 1
