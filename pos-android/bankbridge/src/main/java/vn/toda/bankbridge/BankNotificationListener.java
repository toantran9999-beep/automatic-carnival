package vn.toda.bankbridge;

import android.app.Notification;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Đọc thông báo đẩy của app ngân hàng rồi chuyển NGUYÊN VĂN về máy chủ.
 *
 * Cố ý KHÔNG bóc tách số tiền hay mã đơn ở đây: ngân hàng đổi câu chữ thì chỉ
 * phải sửa regex trên máy chủ rồi deploy, khỏi build lại APK và cài tay lên máy
 * chủ quán. Việc duy nhất của điện thoại là chuyển tiếp và thử lại.
 */
public class BankNotificationListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || sbn.getNotification() == null) return;

            String pkg = sbn.getPackageName();
            // Hàng rào riêng tư: thông báo của app khác không bao giờ rời máy.
            // Chỉ ghi lại TÊN GÓI ở máy để còn biết app ngân hàng tên là gì —
            // đoán sai tên gói thì app im lặng không làm gì và không ai hiểu vì sao.
            if (!Bridge.isAllowedPackage(this, pkg)) {
                Bridge.noteIgnoredPackage(this, pkg);
                return;
            }

            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            JSONObject item = new JSONObject();
            item.put("packageName", pkg);
            item.put("postedAt", sbn.getPostTime());
            item.put("title", str(extras.getCharSequence(Notification.EXTRA_TITLE)));
            item.put("text", str(extras.getCharSequence(Notification.EXTRA_TEXT)));
            // bigText hay chứa BẢN ĐẦY ĐỦ trong khi `text` chỉ là dòng rút gọn
            // hiện ngoài màn khoá — thiếu nó là mất luôn mã TODA-…
            item.put("bigText", str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)));

            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                JSONArray arr = new JSONArray();
                for (CharSequence line : lines) arr.put(str(line));
                item.put("textLines", arr);
            }

            Bridge.enqueue(this, item);
            new Thread(() -> Bridge.flush(getApplicationContext())).start();
        } catch (Exception e) {
            Bridge.log(this, "Lỗi đọc thông báo: " + e.getMessage());
        }
    }

    /**
     * Android hay tự ngắt trình nghe thông báo (cập nhật app, dọn RAM, trình
     * tiết kiệm pin của hãng). KHÔNG gọi requestRebind là app chết câm: không
     * báo lỗi gì cả, chỉ đơn giản là không đơn nào tự chốt nữa.
     */
    @Override
    public void onListenerDisconnected() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new android.content.ComponentName(this, BankNotificationListener.class));
        }
        Bridge.log(this, "Bị ngắt kết nối — đang xin nối lại");
    }

    @Override
    public void onListenerConnected() {
        Bridge.log(this, "Trình nghe thông báo đã sẵn sàng");
        new Thread(() -> Bridge.flush(getApplicationContext())).start();
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }
}
