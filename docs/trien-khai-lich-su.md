# Triển khai: nhập lịch sử POS cũ

Chạy **sau khi đóng ca** (quán bán tới ~21h). Bước build làm API/web khởi động lại — máy POS gián đoạn vài chục giây.

Bối cảnh: VPS `14.225.212.172`, thư mục `/root/toda-pos`, nhánh `master`, clone nông.

---

## 1. Trên máy local — đẩy code

```bash
cd ~/Desktop/POS_TODA/restai
git add -A
git commit -m "feat(reports): nhap lich su ban hang tu POS cu"
git push origin master
```

## 2. Trên VPS — kéo code về

```bash
cd /root/toda-pos
git pull origin master
```

⚠️ **Đừng đè `Caddyfile`** — bản trên VPS sửa tay, khác bản trong repo.

## 3. Build lại + chạy migration

```bash
cd /root/toda-pos
docker compose build api web migrate
docker compose up -d
```

🔴 **Phải có `migrate` trong lệnh `build`.** `docker compose up -d` KHÔNG tự dựng lại image của migrate — thiếu bước này thì hai bảng mới không được tạo, mà log vẫn báo "Migrations completed successfully".

Kiểm tra bảng đã có:

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "\dt sales_history*"
```

Phải thấy `sales_history_daily` và `sales_history_items`.

## 4. Chép dữ liệu đã trích xuất lên VPS

`data_old/` nằm trong `.gitignore` nên **không đi theo `git pull`** — phải chép tay. Chỉ ~1,8MB (file xlsx 83MB gốc không cần lên VPS).

Nếu chưa trích xuất, chạy trên máy local trước:

```bash
cd ~/Desktop/POS_TODA/restai
PYTHONIOENCODING=utf-8 python scripts/extract-legacy-sales.py
```

Kết quả phải là: **359 dòng ngày · 12.534 dòng món×ngày · lệch 0đ**.

Rồi chép lên:

```bash
ssh root@14.225.212.172 "mkdir -p /root/toda-pos/data_old/extracted"
scp data_old/extracted/legacy-daily.ndjson root@14.225.212.172:/root/toda-pos/data_old/extracted/
scp data_old/extracted/legacy-items.ndjson root@14.225.212.172:/root/toda-pos/data_old/extracted/
```

## 5. Nhập vào DB

Dùng luôn service `migrate` — nó đã có sẵn `bun`, mã nguồn `packages/db` và biến `DATABASE_URL` trỏ đúng vào Postgres nội bộ.

```bash
cd /root/toda-pos
docker compose run --rm \
  -v /root/toda-pos/data_old/extracted:/data \
  migrate bun run src/import-legacy-sales.ts --dir /data
```

Chạy lại lệnh này bao nhiêu lần cũng được — mọi lệnh insert đều `ON CONFLICT DO NOTHING`. Muốn nhập đè sau khi sửa nguồn thì thêm `--reset` (chỉ xoá đúng `source = 'legacy-pos'` của chi nhánh đó, không đụng đơn hàng thật).

## 6. Đối chiếu

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "
SELECT count(*) AS so_ngay,
       min(business_date) AS tu,
       max(business_date) AS den,
       sum(revenue)/100   AS doanh_thu
FROM sales_history_daily;"
```

Phải ra đúng:

| so_ngay | tu | den | doanh_thu |
|---|---|---|---|
| 359 | 2025-08-01 | 2026-07-25 | 917508500 |

Tổng của bảng món phải **bằng đúng** con số đó:

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "
SELECT count(*) AS so_dong, sum(revenue)/100 AS doanh_thu
FROM sales_history_items;"
```

→ 12.534 dòng · 917.508.500đ

Vài mốc đối chiếu tay:

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "
SELECT to_char(business_date,'YYYY-MM') AS thang,
       sum(revenue)/100 AS doanh_thu,
       sum(order_count) AS hoa_don
FROM sales_history_daily GROUP BY 1 ORDER BY 1;"
```

| Tháng | Doanh thu |
|---|---|
| 2025-08 | 43.882.000đ |
| 2026-02 | 90.885.000đ |
| 2026-07 | 87.579.000đ |

Và `Cà phê đá` cả năm phải ra **24.307 ly**:

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "
SELECT sum(quantity) FROM sales_history_items WHERE item_name = 'Cà phê đá';"
```

## 7. Kiểm tra dữ liệu đang bán KHÔNG bị đụng

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "
SELECT count(*) AS don, sum(total)/100 AS tien FROM orders WHERE status='completed';"
```

Con số này phải giữ nguyên như trước khi triển khai (chỉ tăng theo đơn bán ra bình thường). Migration chỉ **thêm bảng mới**, không sửa bảng nào đang có.

## 8. Kiểm tra giao diện

Đăng nhập bằng tài khoản **quản lý** → trang **Tổng quan** → cuối trang có khối **"Lịch sử hệ thống cũ"**:

- Dải ngày `2025-08-01 → 2026-07-25`
- Biểu đồ 12 cột theo tháng
- Biểu đồ trung bình theo thứ — **Chủ nhật phải thấp nhất rõ rệt**
- Danh sách món bán chạy, đứng đầu là `Cà phê đá`

Đăng nhập bằng tài khoản **thu ngân** → **không** thấy khối này (trang Tổng quan vốn chỉ dành cho quản lý).

---

## Quay lui nếu có sự cố

Hai bảng mới không dính gì tới bảng đang chạy, nên chỉ cần bỏ dữ liệu:

```bash
docker exec toda-pos-postgres-1 psql -U toda -d restai -c "
DELETE FROM sales_history_items WHERE source = 'legacy-pos';
DELETE FROM sales_history_daily WHERE source = 'legacy-pos';"
```

Khối trên trang Tổng quan tự ẩn khi không còn dữ liệu (`available = false`). Muốn lui hẳn code thì `git revert` rồi build lại như bước 3 — bảng để lại cũng không sao, không ai đọc tới.
