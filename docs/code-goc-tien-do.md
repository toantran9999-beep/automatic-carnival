# Tiến độ viết lại code gốc RestAI

Repo này clone từ `github.com/EijunnN/restai` (tác giả Vicenzo). Repo gốc **không có giấy phép** (kiểm 28/10/2026: GitHub API `license: null`, đường `LICENSE` chưa từng có commit), nên về luật tác giả giữ mọi quyền. Anh Toàn chốt: **viết lại dần tới khi không còn dòng nào của tác giả gốc**, và gỡ luôn phần nặng hoặc không dùng.

Thước đo: `bash scripts/dem-code-goc.sh` (thêm `--file` để in từng file). **Xong = 0.**

## Nguyên tắc mỗi đợt

1. Viết mới từ bản mô tả hành vi theo `CONVENTIONS.md`. **Không chép rồi đổi tên** code cũ (vẫn là tác phẩm phái sinh). Giữ tên bảng, cột và đường API.
2. Soát mức sử dụng bằng số liệu thật trước: số dòng trong DB, lượt gọi route. 0 lượt thì gỡ hẳn, không viết lại.
3. Logic tùy chọn món và tiền: giữ nguyên hành vi, đối chiếu từng xu trên đơn thật.
4. Mỗi đợt anh Toàn duyệt kế hoạch riêng. Ban ngày chỉ commit + push; **VPS tự deploy lúc 22h** (`scripts/vps-deploy.sh`).

## Nhật ký

| Ngày | Đợt | Dòng gốc còn lại | Việc |
|---|---|---|---|
| 28/10/2026 | (đo đầu) | **37.917** / 233 file | Mốc ban đầu, tính mọi file trong git trừ lockfile/ảnh |
| 28/10/2026 | 0 | **25.262** / 182 file (−12.655) | Gỡ Bếp/KDS, tích điểm/coupon, khách tự gọi QR (số liệu: 0 lượt dùng), nút "QR bàn", cửa tự đăng ký tổ chức `POST /api/auth/register` (đang mở công khai), `proxy.ts` rỗng, `.agents/skills` bên thứ ba, `PHASE-A-CHANGELOG.md` |

## Còn lại sau đợt 0 (theo khu)

| Khu | Dòng | Đợt dự kiến |
|---|---|---|
| Migration SQL (0000–0004 của tác giả gốc) | 7.600 | 10. Gộp mốc migration, kế hoạch riêng, rủi ro DB |
| Khung, WS, lib, UI chung, gói chung | 3.901 | 9 |
| Bàn ăn | 3.096 | 5 |
| Menu | 2.644 | 7 |
| Đơn / POS / thanh toán | 2.428 | 8. Lõi tiền, làm cuối |
| Auth / nhân viên | 2.214 | 6 |
| Báo cáo / cài đặt | 1.246 | 1 |
| Kho | 1.190 | 4 |
| Cấu hình / tài liệu gốc repo | 448 | 9 |
| Thông báo / lịch (chuông thông báo trạm quầy, `calendar` UI) | 312 | 9 |
| Schema DB tích điểm/coupon (bảng rỗng, chưa xoá bảng) | 183 | 10 |

## Số liệu soát sử dụng (28/10/2026, DB production)

- 0 dòng: `coupons`, `coupon_redemptions`, `coupon_assignments`, `loyalty_programs`, `loyalty_tiers`, `loyalty_transactions`, `customer_loyalty`, `rewards`, `reward_redemptions`, `customers`, `invoices`, `table_assignments`.
- `organizations` = 1 (chỉ quán). Không ai dùng cửa tự đăng ký.
- 0/15.353 đơn từng có `discount ≠ 0` hay gắn `customer_id`, nên gỡ coupon/điểm không đổi tiền đơn nào.
- Tài khoản vai trò `kitchen`: 1 cái, đã khoá, chưa từng đăng nhập.
- Còn dùng: `spaces` (khu vực bàn), `shifts`, mọi bảng đơn/thanh toán/kho/menu.
- Chưa quyết: `invoices` (0 dòng, route `/api/invoices` còn) và `orgs` (route quản lý đa tổ chức). Soát ở đợt 1/6.
