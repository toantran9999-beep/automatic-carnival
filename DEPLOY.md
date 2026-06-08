# Triển khai TODA POS lên VPS (chạy thử)

Hướng dẫn deploy bằng Docker Compose + Caddy (tự động HTTPS). **Không cần mua domain** — dùng `nip.io` ánh xạ thẳng từ IP của VPS, vẫn có HTTPS thật nên **PWA cài được trên điện thoại**.

> Kiến trúc: `Caddy (80/443)` → `web (Next.js :3000)` + `api (Hono/Bun :3001, kèm WebSocket /ws)` → `postgres` + `redis`. Tất cả chạy trong Docker trên 1 VPS.

---

## 0. Yêu cầu

- VPS Linux (Ubuntu 22.04+ khuyến nghị), **IP công khai**, RAM ≥ 2GB.
- Mở **cổng 80 và 443** (cả firewall `ufw` lẫn Security Group của nhà cung cấp).
- Đã cài **Docker + Docker Compose plugin**:
  ```bash
  curl -fsSL https://get.docker.com | sh
  docker compose version   # kiểm tra có bản v2
  ```

## 1. Đưa mã nguồn lên VPS

```bash
# Cách A: git
git clone <repo-url> toda-pos && cd toda-pos/restai
# Cách B: scp/rsync thư mục restai/ lên VPS rồi: cd restai
```

## 2. Tạo file `.env`

```bash
cp .env.example .env
nano .env
```

Đặt các giá trị (giả sử IP VPS là `123.45.67.89`):

```env
WEB_DOMAIN=pos.123.45.67.89.nip.io
API_DOMAIN=api.123.45.67.89.nip.io
ACME_EMAIL=ban@email.com

POSTGRES_USER=toda
POSTGRES_PASSWORD=<mật-khẩu-mạnh>

JWT_SECRET=<dán-kết-quả-openssl-1>
JWT_REFRESH_SECRET=<dán-kết-quả-openssl-2>

# Tao anh san pham bang GPT Image
OPENAI_API_KEY=<openai-api-key>
GPT_IMAGE_MODEL=gpt-image-1
GPT_IMAGE_SIZE=1024x1024
GPT_IMAGE_QUALITY=medium

# Fal.ai image generation (uu tien neu co FAL_KEY)
FAL_KEY=<fal-key>
FAL_IMAGE_MODEL=fal-ai/gpt-image-2
FAL_IMAGE_SIZE=square_hd
FAL_IMAGE_QUALITY=medium
FAL_IMAGE_TIMEOUT_MS=180000
# Neu khong cau hinh R2, anh AI se luu vao volume uploadsdata va hien qua /uploads
LOCAL_UPLOAD_DIR=/app/apps/web/public/uploads
PUBLIC_UPLOAD_URL=/uploads
```

Sinh secret mạnh:
```bash
openssl rand -hex 32   # chạy 2 lần, lấy cho JWT_SECRET và JWT_REFRESH_SECRET
```

> `nip.io` tự phân giải: `pos.123.45.67.89.nip.io` → `123.45.67.89`. **Không cần cấu hình DNS.**

## 3. Build & khởi chạy

```bash
docker compose up -d --build
```

- `migrate` tự chạy tạo bảng (từ `packages/db/drizzle`) rồi thoát.
- `caddy` tự xin chứng chỉ Let's Encrypt cho 2 domain (mất ~30–60s lần đầu).

Theo dõi:
```bash
docker compose ps
docker compose logs -f caddy   # xem quá trình cấp SSL
docker compose logs -f api
```

## 4. Nạp dữ liệu mẫu (chạy MỘT lần)

```bash
docker compose run --rm migrate bun run src/seed.ts
```

Tài khoản sau khi seed:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Admin | `admin@toda.local` | `admin12345` |
| Quản lý | `quanly@toda.local` | `quanly123` |
| Thu ngân | `thungan@toda.local` | `thungan123` |
| Phục vụ | `phucvu@toda.local` | `phucvu123` |
| Bếp/Pha chế | `bep@toda.local` | `bep12345` |

> ⚠️ Đổi mật khẩu các tài khoản này trước khi dùng thật.

## 5. Truy cập & kiểm thử

1. Mở `https://pos.123.45.67.89.nip.io` → đăng nhập `admin@toda.local`.
2. **Cài PWA:** trên điện thoại mở link, Chrome/Safari → "Thêm vào màn hình chính" → chạy toàn màn hình như app.
3. **In tách/gộp:** Cài đặt → Chi nhánh → "Kiểu in phiếu" chọn *Mỗi món 1 phiếu* hoặc *Gộp* → tạo đơn để in thử.
4. **Báo cáo đa chi nhánh:** đăng nhập admin → Báo cáo → bật "Tất cả chi nhánh".

> 🖨️ **Lưu ý về in:** hệ thống in qua trình duyệt (`window.print()`). Máy in nhiệt USB/LAN phải được cài trên **chính thiết bị đang mở web** (máy POS Android/máy tính tại quầy), không phải trên VPS. VPS chỉ phục vụ ứng dụng.

## 6. Cập nhật phiên bản mới

```bash
git pull
docker compose up -d --build
```
- Nếu **đổi domain** (`API_DOMAIN`), phải build lại web vì URL API được nướng vào lúc build:
  ```bash
  docker compose build --no-cache web && docker compose up -d
  ```

## 7. Xử lý sự cố

| Triệu chứng | Cách xử lý |
| --- | --- |
| Không ra HTTPS / lỗi cert | Kiểm tra cổng 80/443 mở (firewall + cloud SG). Xem `docker compose logs caddy`. |
| Web gọi sai API / lỗi CORS | `API_DOMAIN` đúng chưa? Build lại web (mục 6). API tự nhận CORS = `https://${WEB_DOMAIN}`. |
| WebSocket (bếp realtime) không chạy | Caddy đã proxy `/ws` tự động; kiểm tra `api` healthy: `docker compose ps`. |
| Đăng nhập lỗi 401 liên tục | Kiểm tra `JWT_SECRET`/`JWT_REFRESH_SECRET` đã đặt, container `api` đã restart sau khi sửa `.env`. |
| Upload ảnh món lỗi | Cần cấu hình Cloudflare R2 (mục R2_* trong `.env`). Không bắt buộc khi chạy thử. |

Lệnh hữu ích:
```bash
docker compose logs -f --tail=100        # xem log tất cả
docker compose restart api               # restart API sau khi đổi .env
docker compose down                      # dừng (giữ dữ liệu trong volume)
docker compose down -v                   # dừng + XÓA dữ liệu (cẩn thận)
```

## 8. Ghi chú bảo mật khi chạy thật

- Đổi toàn bộ mật khẩu seed + `POSTGRES_PASSWORD` + JWT secrets.
- Không mở cổng 5432 (Postgres) / 6379 (Redis) ra ngoài — compose đã không publish chúng.
- Sao lưu volume `pgdata` định kỳ.
