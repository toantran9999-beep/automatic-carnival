# TODA POS Quầy — APK Android (vỏ WebView + cầu in USB)

App Android tối giản cho máy POS ở quầy (iPOS…):

- Nạp thẳng web TODA POS (`https://pos.14.225.212.172.nip.io`) toàn màn hình, giữ màn luôn sáng.
- Phơi `window.TodaPrintBridge.printBase64(base64)` → web (driver **android_bridge**) in **trực tiếp** ra máy in **Gprinter qua USB** (ESC/POS thô), **không qua RawBT** → in im lặng, ổn định.

## Build ra file .apk (qua GitHub Actions)

1. Vào GitHub repo → tab **Actions** → workflow **"Build POS Android APK"**.
2. Bấm **Run workflow** (nhánh `master`) — hoặc nó tự chạy khi có thay đổi trong `pos-android/`.
3. Đợi build xong → mở lần chạy → mục **Artifacts** → tải **`toda-pos-quay-apk`** (chứa `app-debug.apk`).

> Workflow nằm ở `.github/workflows/build-apk.yml`. Trước đây có thêm một bản chép
> tay ở `pos-android/ci-build-apk.yml` (hồi token thiếu quyền `workflow`) — **đã xoá**
> vì giữ hai bản chỉ tạo chỗ để lệch nhau.

Dự án này có **hai module**, một lần build ra cả hai APK:

| Module | Artifact | Cài ở đâu |
|---|---|---|
| `:app` | `toda-pos-quay-apk` | máy POS ở quầy (in USB Gprinter) |
| `:bankbridge` | `toda-bank-bridge-apk` | **điện thoại chủ quán** — đọc thông báo ngân hàng để đơn tự chốt. Xem `bankbridge/README.md` |

⚠️ `:bankbridge` ký bằng **khoá cố định** (GitHub secret) nên cài đè được. `:app`
thì chưa — mỗi lần cập nhật máy quầy vẫn phải gỡ rồi cài lại, kéo theo mất quyền
USB máy in và cờ Trạm quầy, nên **chọn giờ đóng cửa**. Muốn máy quầy cũng cài đè
được thì thêm `apply from: "$rootDir/signing.gradle"` vào `app/build.gradle` —
nhưng lần chuyển đó cũng tốn đúng một lần gỡ cài lại.

> Đây là APK **debug** (đã ký bằng debug key) nên cài thẳng được, không cần keystore.

## Cài lên máy iPOS

1. Copy `app-debug.apk` vào máy iPOS (USB/Zalo/Drive…).
2. Mở file → cho phép **"Cài từ nguồn không xác định"** nếu được hỏi → Cài.
3. Mở app **TODA POS Quầy**.
4. Cắm máy in Gprinter qua USB → khi Android hỏi quyền USB, chọn **OK** + tick **"Luôn cho phép"**.

## Cấu hình trong app

1. Đăng nhập POS như thường.
2. **Cài đặt → Chi nhánh → Trình điều khiển in** → chọn **"Cầu in Android"** (`android_bridge`) → Lưu.
3. **Cài đặt → Thiết bị này** → bật **Trạm quầy** (để máy này tự in khi có đơn).
4. Test: từ điện thoại đặt 1 đơn → máy quầy tự in phiếu ra Gprinter.

## Ghi chú kỹ thuật

- `MainActivity.java`: WebView + `PrintBridge` (USB bulk OUT, ESC/POS thô, chia khối 16KB).
- Tìm máy in: ưu tiên USB class 7 (Printer); nếu không có thì lấy thiết bị có endpoint bulk OUT.
- Đổi URL POS: sửa hằng `POS_URL` trong `MainActivity.java`.
- Mở két tiền: thêm lệnh ESC/POS kick (0x1B 0x70 …) vào payload phía web (chưa bật).
- Nếu Gprinter không enumerate là class 7 và app không tự nhận → gửi mình **VID/PID** (xem trong cài đặt USB / `lsusb`) để lọc chính xác.
