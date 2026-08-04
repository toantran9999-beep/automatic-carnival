package vn.toda.bankbridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Dịch vụ nổi giữ cho cầu nối sống, và mỗi vài phút báo về máy chủ "tôi còn sống".
 *
 * ⚠️ Vì sao phải là dịch vụ NỔI (foreground): trước bản này app không có gì neo
 * tiến trình lại, nên MIUI đóng băng nó lúc nào cũng được. Ngày 04/08/2026 nó im
 * đúng 9 tiếng (12:51 → 21:38) và hai lượt chuyển khoản lúc 20:40 phải bấm tay.
 * Không có lỗi nào được ghi ở đâu cả — đó mới là chỗ tệ.
 *
 * Cái giá phải trả là một thông báo thường trực trên màn hình. Đổi lại nó cũng
 * chính là chỗ nhìn nhanh xem cầu nối đang ra sao.
 */
public class BridgeService extends Service {

    private static final String CHANNEL_ID = "toda_bridge";
    private static final int NOTIF_ID = 8802;

    /**
     * 5 phút. Máy chủ coi là chết sau 15 phút, tức phải HỤT BA NHỊP LIỀN mới báo
     * đỏ — một lần chập 4G không làm POS kêu oan.
     */
    private static final long BEAT_MS = 5 * 60_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean running = false;

    private final Runnable beat = new Runnable() {
        @Override
        public void run() {
            new Thread(() -> {
                Context app = getApplicationContext();

                /*
                 * Tự chữa trình nghe thông báo.
                 *
                 * `onListenerDisconnected()` có gọi `requestRebind()` rồi, NHƯNG khi
                 * Android giết cả tiến trình thì hàm đó không bao giờ chạy. Đó đúng
                 * là lỗ hổng đã làm im 9 tiếng hôm 04/08 — app còn quyền, chỉ là
                 * không ai nối lại dịch vụ cho nó.
                 */
                if (Bridge.hasNotificationAccess(app) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try {
                        android.service.notification.NotificationListenerService.requestRebind(
                                new ComponentName(app, BankNotificationListener.class));
                    } catch (Exception ignored) {
                    }
                }

                // Còn hàng đợi thì đẩy trước — tiền của khách quan trọng hơn nhịp thở.
                if (Bridge.queueSize(app) > 0) Bridge.flush(app);

                Bridge.sendHeartbeat(app);
                handler.post(() -> updateNotification());
            }).start();

            handler.postDelayed(this, BEAT_MS);
        }
    };

    /** Bật dịch vụ; gọi được nhiều lần, lần sau không tạo thêm gì. */
    public static void start(Context ctx) {
        try {
            Intent i = new Intent(ctx, BridgeService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(i);
            } else {
                ctx.startService(i);
            }
        } catch (Exception e) {
            Bridge.log(ctx, "Không bật được dịch vụ nền: " + e.getMessage());
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIF_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running) {
            running = true;
            // Nhịp đầu chạy ngay: vừa bật máy hay vừa cài lại app thì máy chủ phải
            // biết liền, chứ không phải đợi hết 5 phút.
            handler.post(beat);
        }
        // START_STICKY: Android có giết vì thiếu RAM thì cũng phải dựng lại.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(beat);
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        // Dạng chuỗi chứ không dùng getSystemService(Class) — dạng kia đòi API 23,
        // mà minSdk của module là 21.
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        // IMPORTANCE_LOW: không kêu, không rung. Đây là thông báo thường trực cả
        // ngày, kêu một tiếng thôi cũng đủ khiến người ta đi tắt nó.
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Cầu nối ngân hàng", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Giữ cầu nối chạy để đơn tự chốt");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        Context app = getApplicationContext();
        int queued = Bridge.queueSize(app);
        boolean access = Bridge.hasNotificationAccess(app);

        String line;
        if (!Bridge.isConfigured(app)) {
            line = "CHƯA cấu hình — mở app dán chuỗi cấu hình";
        } else if (!access) {
            line = "CHƯA bật quyền đọc thông báo — đơn sẽ không tự chốt";
        } else {
            line = queued > 0 ? queued + " thông báo đang chờ gửi" : "Đang theo dõi thông báo ngân hàng";
        }

        PendingIntent open = PendingIntent.getActivity(
                this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT
                        | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return b.setContentTitle("TODA Bank Bridge")
                .setContentText(line)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentIntent(open)
                .setOngoing(true)
                .build();
    }

    private void updateNotification() {
        try {
            // Dạng chuỗi chứ không dùng getSystemService(Class) — dạng kia đòi API 23,
        // mà minSdk của module là 21.
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification());
        } catch (Exception ignored) {
        }
    }
}
