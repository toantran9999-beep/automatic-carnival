# TODA Bank Bridge — APK đọc thông báo ngân hàng

APK **riêng**, cài trên **điện thoại chủ quán** (KHÔNG phải máy quầy). Đọc thông
báo đẩy của app ngân hàng rồi báo về POS để **đơn tự chốt, bàn tự dọn**.

## Vì sao có cái này

Bốn đường tự động khác đều tắc hoặc tốn tiền:

| Đường | Kết cục |
|---|---|
| MoMo | Từ chối hộ kinh doanh nhỏ/lẻ |
| SePay | 176.000đ/tháng/chi nhánh |
| PayOS | Miễn phí nhưng **không hỗ trợ Vietcombank** |
| SMS biến động số dư | 11k/tháng chỉ được 20 tin, tin thứ 21 trở đi 770đ → ~265.000đ/tháng |

Thông báo đẩy của app ngân hàng thì **miễn phí và không giới hạn**.

## Vì sao tách khỏi app quầy

Máy quầy là máy dùng chung. Không nên cấp quyền đọc thông báo ở đó, và cũng
không nên bắt máy quầy đăng nhập ngân hàng.

## Nguyên tắc thiết kế

- **Điện thoại KHÔNG bóc tách gì cả** — gửi nguyên văn thông báo về máy chủ.
  Ngân hàng đổi câu chữ thì sửa regex rồi deploy, khỏi build lại APK và cài tay.
- **Chỉ gửi thông báo của đúng app ngân hàng đã khai.** Tin nhắn riêng tư, Zalo,
  mọi thứ khác không bao giờ rời khỏi máy.
- **Hàng đợi ghi xuống đĩa.** Mỗi mục là một lần khách đã trả tiền; mất mạng hay
  bị Android giết tiến trình cũng phải đẩy được sau đó.

## Cài đặt

1. **Build**: GitHub Actions → workflow *Build POS Android APK* → tải artifact
   **`toda-bank-bridge-apk`** (`bankbridge-debug.apk`).
2. **Lấy chuỗi cấu hình**: POS → **Cài đặt → Chi nhánh** → sửa chi nhánh → bật
   **Cầu thông báo ngân hàng** → bấm **Tạo khóa** → **Lưu** → chép chuỗi cấu hình.
   > ⚠️ Chuỗi chỉ hiện đúng lúc đó. Đóng hộp thoại là không lấy lại được (máy chủ
   > che khóa đi) — phải tạo khóa mới.
3. **Trên điện thoại**: cài APK → mở app → dán chuỗi → **Lưu cấu hình**.
4. Bấm **Bật quyền đọc thông báo** → tìm *TODA Bank Bridge* → bật.
5. Bấm **Tắt tối ưu pin cho app này**.
6. Bấm **Gửi thử** → nhật ký phải hiện `Đã gửi`. Ra `HTTP 401` là sai khóa,
   ra `mất mạng` là sai địa chỉ API.

### Máy Xiaomi / Oppo / Vivo

Mấy dòng này diệt tiến trình nền rất mạnh. Làm thêm:

- Cài đặt → Ứng dụng → TODA Bank Bridge → bật **Tự khởi động**
- Mở trình đa nhiệm → **khoá** app lại
- Cài đặt → Pin → chọn **Không giới hạn** cho app này

Không làm mấy bước này thì app chạy vài tiếng rồi im, và **không báo lỗi gì cả**
— chỉ đơn giản là không đơn nào tự chốt nữa.

## Tự kiểm

Hai dòng đầu trên màn hình phải xanh:

```
✓ Đã cấu hình: https://api...
✓ Đã có quyền đọc thông báo
Đang chờ gửi: 0
```

`Đang chờ gửi` cứ tăng mà không về 0 nghĩa là không gửi được — xem nhật ký.

## Ghi chú kỹ thuật

- `BankNotificationListener` bắt cả `EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`
  và `EXTRA_TEXT_LINES`. Phần đầy đủ hay nằm ở `bigText`, còn `text` chỉ là dòng
  rút gọn ngoài màn khoá — chỉ đọc `text` là mất mã `TODA-…`.
- `onListenerDisconnected()` → `requestRebind()`. Thiếu chỗ này là app chết câm
  sau mỗi lần Android ngắt dịch vụ.
- Hàng đợi + nhật ký nằm trong `SharedPreferences` (`Bridge.java`), tối đa 200
  mục và 20 dòng nhật ký.
- Thử lại bằng `JobScheduler` (chờ có mạng) và `BOOT_COMPLETED`.
- `allowBackup=false` — máy giữ khóa cầu nối, đừng để lọt vào sao lưu đám mây.
- Máy chủ nhận ở `POST /api/payments/webhooks/bank-push`, xác thực bằng hai
  header `X-Toda-Branch` + `X-Toda-Bridge-Key`.
