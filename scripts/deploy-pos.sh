#!/usr/bin/env bash
# Deploy TODA POS (api + web, kèm migrate khi có .sql mới) lên VPS rồi tự kiểm.
#
#   bash scripts/deploy-pos.sh            # build api + web (+ migrate nếu cần)
#   bash scripts/deploy-pos.sh --only api # chỉ api (vd sửa route, không đụng web)
#   bash scripts/deploy-pos.sh --only web
#
# Chạy từ Git Bash trên máy Windows, thư mục restai/. Lấy code TỪ COMMIT
# (VPS git pull), không lấy file đang sửa dở — nhiều phiên Claude chạy song
# song trên cùng repo (sự cố 08/10/2026).
#
# Vì sao có script: deploy gõ tay hay quên `migrate` (up -d KHÔNG rebuild nó,
# log vẫn "thành công" mà DB không đổi — sự cố 21/07/2026) và hay quên tự kiểm.
set -euo pipefail

ONLY=""
if [ "${1:-}" = "--only" ]; then ONLY="${2:-}"; fi
case "$ONLY" in ""|api|web) ;; *) echo "--only chỉ nhận api hoặc web" >&2; exit 2;; esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/../.vps.env"
HOSTKEY="ssh-ed25519 255 SHA256:TCjWFSdRmgxdH+DghQ8atge7oCePheLFuv6f/pK6XGM"
cd "$ROOT"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

# ---------- 1. Kiểm repo local ----------
say "1/5 Kiểm repo local"
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "master" ] || die "Đang ở nhánh '$branch' — VPS chỉ theo master."

dirty=$(git status --porcelain --untracked-files=no)
if [ -n "$dirty" ]; then
  echo "$dirty"
  die "Còn file đã theo dõi chưa commit (ở trên). Commit đúng file của mình hoặc để phiên kia xong — VPS chỉ lấy code đã commit."
fi
untracked=$(git status --porcelain | grep '^??' || true)
[ -n "$untracked" ] && printf 'ℹ️  File chưa theo dõi (KHÔNG lên VPS, để nguyên):\n%s\n' "$untracked"

LOCAL_HEAD=$(git rev-parse HEAD)
echo "HEAD local: $(git log --oneline -1)"

# ---------- 2. Push ----------
say "2/5 Push lên GitHub"
git fetch -q origin master
if [ -n "$(git rev-list origin/master..HEAD)" ]; then
  git push -q origin master
  echo "Đã push."
else
  echo "origin/master đã có HEAD này."
fi
[ -z "$(git rev-list HEAD..origin/master)" ] || die "origin/master có commit mà local chưa có — git pull trước đã."

# ---------- 3. Chuẩn bị SSH (mật khẩu chỉ nằm trong file tạm, xoá khi thoát) ----------
[ -f "$ENVF" ] || die "Không thấy $ENVF"
PW=$(mktemp)
trap 'rm -f "$PW" "${REMOTE:-}"' EXIT
grep -E '^VPS_PASSWORD=' "$ENVF" | head -1 | sed -E 's/^[^=]+=//; s/^"//; s/"$//' | tr -d '\r\n' > "$PW"
[ -s "$PW" ] || die "Không đọc được VPS_PASSWORD trong .vps.env"
VPS_USER=$(grep -E '^VPS_USER=' "$ENVF" | sed -E 's/^[^=]+=//; s/"//g' | tr -d '\r\n')
VPS_HOST=$(grep -E '^VPS_HOST=' "$ENVF" | sed -E 's/^[^=]+=//; s/"//g' | tr -d '\r\n')

# ---------- 4+5. Trên VPS: pull, build, up, tự kiểm ----------
REMOTE=$(mktemp)
cat > "$REMOTE" <<EOF
set -e
cd /root/toda-pos
PSQL="docker compose exec -T postgres psql -U toda -d restai -tAc"
count_mig() { \$PSQL "select count(*) from drizzle.__drizzle_migrations" < /dev/null 2>/dev/null || echo "?"; }

echo "== 3/5 Pull trên VPS"
OLD=\$(git rev-parse HEAD)
git pull --ff-only -q
NEW=\$(git rev-parse HEAD)
[ "\$NEW" = "$LOCAL_HEAD" ] || { echo "❌ VPS ở \$NEW, khác local $LOCAL_HEAD"; exit 1; }
echo "VPS: \$(git log --oneline -1)"

CHANGED=\$(git diff --name-only "\$OLD" "\$NEW")
SERVICES="${ONLY:-api web}"
NEED_MIGRATE=0
if echo "\$CHANGED" | grep -q '^packages/db/drizzle/'; then NEED_MIGRATE=1; SERVICES="\$SERVICES migrate"; fi
[ "\$OLD" = "\$NEW" ] && echo "ℹ️  VPS đã ở commit này — vẫn build lại theo yêu cầu."

JOURNAL=\$(grep -c '"tag"' packages/db/drizzle/meta/_journal.json)
SQLS=\$(ls packages/db/drizzle/*.sql | wc -l)
[ "\$JOURNAL" = "\$SQLS" ] || { echo "❌ Journal \$JOURNAL mục nhưng có \$SQLS file .sql — migrate sẽ bỏ sót. Dừng."; exit 1; }
BEFORE=\$(count_mig)

echo "== 4/5 Build: \$SERVICES"
# Build lỗi mà vẫn up -d thì container chạy ẢNH CŨ, healthy như thường —
# tự kiểm bên dưới sẽ báo OK sai. Nên build hỏng là dừng ở đây.
if ! docker compose build \$SERVICES > /tmp/deploy-pos-build.log 2>&1; then
  tail -30 /tmp/deploy-pos-build.log; echo "❌ Build lỗi — chưa up gì, bản đang chạy giữ nguyên."; exit 1
fi
grep -E 'Built' /tmp/deploy-pos-build.log || true
docker compose up -d \$SERVICES 2>&1 | tail -4

echo "== 5/5 Tự kiểm"
ok=1
for i in \$(seq 1 30); do
  bad=""
  for s in ${ONLY:-api web}; do
    st=\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "toda-pos-\$s-1" 2>/dev/null || echo missing)
    [ "\$st" = "healthy" ] || [ "\$st" = "running" ] || bad="\$bad \$s=\$st"
  done
  [ -z "\$bad" ] && break
  sleep 3
done
[ -z "\$bad" ] && echo "✅ Container:${ONLY:- api web} chạy" || { echo "❌ Container chưa lên:\$bad"; ok=0; }

AFTER=\$(count_mig)
echo "Migration trong DB: \$BEFORE → \$AFTER (journal: \$JOURNAL)"
if [ "\$AFTER" != "\$JOURNAL" ]; then
  echo "❌ DB có \$AFTER migration nhưng journal \$JOURNAL — xem: docker compose logs migrate"; ok=0
elif [ "\$NEED_MIGRATE" = 1 ]; then
  echo "✅ Migration mới đã vào DB"
fi

if docker compose exec -T api wget -qO- http://localhost:3001/health < /dev/null > /dev/null 2>&1; then
  echo "✅ API /health trả 200"
else
  echo "❌ API /health không trả lời"; ok=0
fi
code=\$(curl -s -o /dev/null -w '%{http_code}' https://pos.14.225.212.172.nip.io/ || echo 000)
case "\$code" in 200|30?) echo "✅ Web qua Caddy: HTTP \$code";; *) echo "❌ Web qua Caddy: HTTP \$code"; ok=0;; esac

[ "\$ok" = 1 ] && echo "DEPLOY_OK" || { echo "DEPLOY_FAIL"; exit 1; }
EOF

plink -batch -hostkey "$HOSTKEY" -pwfile "$PW" "$VPS_USER@$VPS_HOST" -m "$REMOTE"
