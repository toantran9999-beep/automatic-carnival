# AGENTS.md — Quy trình chuẩn cho mọi AI/agent (Codex, Claude…) làm việc trên TODA POS

> 🗺️ Bản đồ codebase + log tính năng: đọc [ARCHITECTURE.md](ARCHITECTURE.md) trước khi sửa (đỡ phải quét hết code).
>
> 📐 **Quy ước viết code** (vỏ API, báo lỗi, phân quyền, thành phần giao diện dùng chung, các bẫy đã trả giá): [CONVENTIONS.md](CONVENTIONS.md). Đọc trước khi thêm endpoint hay màn hình mới.

> ⚠️ ĐỌC TRƯỚC KHI SỬA BẤT KỲ FILE NÀO. Dự án này có **nhiều agent + nhiều máy** cùng sửa
> (Codex sửa trực tiếp trên VPS, Claude sửa trên máy local Windows). Nếu không theo quy trình
> này sẽ **đè mất việc của nhau**. Đã từng suýt mất việc — tuân thủ nghiêm.

---

## 0. Nguồn chân lý duy nhất (Single source of truth)

- **GitHub repo là gốc:** `toantran9999-beep/automatic-carnival`, nhánh **`master`**.
- Mọi máy (local, VPS) phải **đồng bộ qua GitHub**, KHÔNG chép tay/scp giữa các máy.
- VPS chạy ở `/root/toda-pos`. Local Windows ở `C:\Users\TPT\Desktop\POS_TODA\restai`.

## 1. Vòng lặp làm việc BẮT BUỘC

```bash
# 1) TRƯỚC KHI SỬA: lấy bản mới nhất
git fetch origin && git status        # phải "clean" trước khi bắt đầu
git pull --ff-only origin master

# 2) Sửa code...

# 3) Kiểm tra biên dịch TRƯỚC KHI commit (bắt buộc)
bunx tsc --noEmit -p apps/web/tsconfig.json
bunx tsc --noEmit -p apps/api/tsconfig.json

# 4) Commit NGAY + push NGAY (commit nhỏ, thường xuyên)
git add -p          # xem kỹ; tránh git add -A trừ khi chắc chắn
git commit -m "mô tả ngắn gọn việc làm"
git push origin master
```

**Quy tắc vàng:**
- **KHÔNG để 2 agent sửa cùng lúc.** Trước khi chạy, hỏi/đảm bảo agent kia đã `push` xong và dừng.
- **Commit + push ngay sau khi xong**, đừng để code "treo" chưa commit nhiều giờ.
- **Không bao giờ `git add -A`** khi working tree có việc dở của agent khác (dễ gom nhầm). Add từng file.
- Nếu `git pull` báo conflict / "would be overwritten": **DỪNG, backup, báo người dùng** — đừng `reset --hard`/`checkout -f` ẩu.

## 2. Khi phải hòa giải (reconcile) 2 nhánh việc

```bash
# Luôn BACKUP trước
cp -r /root/toda-pos /root/toda-pos-backup-$(date +%Y%m%d-%H%M%S)   # hoặc backup file đang sửa
# So sánh BỎ QUA whitespace (vì CRLF gây nhiễu)
git diff -w <ref>
# Nếu nội dung trùng (chỉ khác CRLF) -> an toàn đồng bộ. Nếu khác thật -> merge tay, giữ cả 2 phần.
```

## 3. Line endings (CRLF) — đã ép LF

- Repo có `.gitattributes` ép **LF** cho mọi file text. Đừng đổi.
- Local Windows nên đặt: `git config core.autocrlf false` (để khỏi commit CRLF gây diff rác).

## 4. Bí mật & file KHÔNG được commit

- **TUYỆT ĐỐI không commit:** `.env`, `.env.*`, `.env.bak*` (chứa secret: JWT, OPENAI_API_KEY, FAL_KEY, mật khẩu DB).
- Đã có trong `.gitignore`. Kiểm tra `git status` trước khi commit, đừng để lọt.
- Log/tạm: `*.log`, `*.bak`, `deploy.log`, `rebuild-all.log` — không commit.

## 5. Database — CỰC KỲ cẩn thận (dữ liệu thật)

- **KHÔNG bao giờ chạy `db:seed` / `src/seed.ts` trên hệ thống đang có dữ liệu** — script này `TRUNCATE` SẠCH mọi bảng rồi nạp lại mẫu. Chỉ seed cho DB trống lần đầu.
- Dữ liệu thật nằm trong Docker volume **`pgdata`** trên VPS. Backup trước khi làm gì đụng DB:
  ```bash
  docker exec toda-pos-postgres-1 pg_dump -U toda -d restai > /root/db-backup-$(date +%F-%H%M).sql
  ```
- Đổi schema: tạo migration bằng `bun run --filter @restai/db generate`, commit file trong `packages/db/drizzle/`.
  Migration tự chạy khi `docker compose up` (service `migrate`). KHÔNG sửa SQL migration đã chạy.

## 6. Deploy lên VPS (sau khi đã push GitHub)

```bash
cd /root/toda-pos
git pull --ff-only origin master
docker compose up -d --build        # build web+api, migrate tự áp migration mới
docker compose ps                   # tất cả phải healthy
docker compose logs -f api          # nếu cần xem lỗi
```
- Đổi **chỉ web** thì build lâu (~10 phút, Next.js): `docker compose up -d --build web`.
- Đổi **chỉ api**: nhanh: `docker compose up -d --build api`.
- Đổi `API_DOMAIN`/env build của web → phải `docker compose build --no-cache web`.
- **Không** sửa file trực tiếp trong container; luôn sửa qua git rồi rebuild.

## 7. RAM thấp (VPS 2GB) 

- Build Next.js ngốn RAM; đã có swap 2GB. Nếu build chết (OOM), thử lại hoặc tắt bớt container tạm.
- Không chạy nhiều build song song.
- **Chỉ sửa web** (không đổi Dockerfile/package.json chung) → dùng 2 bước tách rời, nhẹ hơn `up -d --build web` (tránh kéo theo rebuild api/migrate khi base image đổi):
  ```bash
  docker compose build web && docker compose up -d --no-deps web
  ```

## 8. Kiến trúc nhanh (để khỏi đoán)

- Monorepo Bun + Turborepo. `apps/api` (Hono/Bun, :3001, WS `/ws`), `apps/web` (Next.js, :3000),
  `packages/{db,ui,validators,types,config}`.
- Production: Docker Compose + **Caddy** (auto-HTTPS, domain `*.nip.io`) trên VPS `14.225.212.172`.
  Web: `https://pos.14.225.212.172.nip.io`, API: `https://api.14.225.212.172.nip.io`.
- Phân quyền theo vai trò ở `packages/config/src/index.ts` (PERMISSIONS). UI theme token ở
  `apps/web/src/app/globals.css` (accent đổi runtime qua `--accent-runtime`).
- In phiếu: `window.print()` phía client (máy POS cài RawBT cho máy in nhiệt USB).

---

**Tóm tắt 1 dòng:** Pull trước → sửa → tsc → commit & push NGAY → deploy bằng `git pull` + `docker compose up -d --build`. Không seed prod. Không commit secret. Không để 2 agent đụng cùng file.
