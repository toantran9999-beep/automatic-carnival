package vn.toda.bankbridge;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Màn hình cấu hình duy nhất của cầu nối.
 *
 * Dựng bằng code chứ không dùng file layout — app chỉ có một màn hình, thêm XML
 * chỉ tổ thêm chỗ để lệch nhau.
 */
public class MainActivity extends Activity {

    private EditText configInput;
    private EditText packagesInput;
    private EditText keywordsInput;
    private TextView statusView;
    private TextView ignoredView;
    private TextView logView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("TODA Bank Bridge");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Đọc thông báo app ngân hàng và báo về POS để đơn tự chốt, bàn tự dọn.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setPadding(0, dp(4), 0, dp(12));
        root.addView(hint);

        statusView = new TextView(this);
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        statusView.setPadding(0, 0, 0, dp(12));
        root.addView(statusView);

        configInput = new EditText(this);
        configInput.setHint("Dán chuỗi cấu hình từ Cài đặt → Chi nhánh");
        configInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        root.addView(configInput);

        root.addView(button("Lưu cấu hình", v -> {
            String blob = configInput.getText().toString();
            if (TextUtils.isEmpty(blob.trim())) {
                toast("Chưa dán chuỗi cấu hình");
                return;
            }
            String api = Bridge.applyConfigBlob(this, blob);
            if (api == null) {
                toast("Chuỗi cấu hình không đọc được");
                return;
            }
            configInput.setText("");
            Bridge.log(this, "Đã lưu cấu hình: " + api);
            // Có cấu hình rồi mới bật được dịch vụ nổi — trước đó nó không biết
            // gửi nhịp thở về đâu.
            BridgeService.start(this);
            toast("Đã lưu");
            refresh();
        }));

        TextView pkgLabel = new TextView(this);
        pkgLabel.setText("App theo dõi (tên gói, cách nhau dấu phẩy)");
        pkgLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        pkgLabel.setPadding(0, dp(12), 0, 0);
        root.addView(pkgLabel);

        packagesInput = new EditText(this);
        packagesInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        root.addView(packagesInput);

        TextView kwLabel = new TextView(this);
        kwLabel.setText("Từ khoá bắt buộc (để TRỐNG là nhận hết)");
        kwLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        kwLabel.setPadding(0, dp(10), 0, 0);
        root.addView(kwLabel);

        TextView kwHint = new TextView(this);
        kwHint.setText("Chỉ điền khi theo dõi app nhắn tin (Zalo…), để tin nhắn riêng tư không bị "
                + "gửi đi. Theo dõi app ngân hàng thì cứ để trống.");
        kwHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        root.addView(kwHint);

        keywordsInput = new EditText(this);
        keywordsInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        keywordsInput.setHint("ví dụ: Số dư TK");
        root.addView(keywordsInput);

        root.addView(button("Lưu app theo dõi + từ khoá", v -> {
            Bridge.setAllowedPackages(this, packagesInput.getText().toString());
            Bridge.setKeywords(this, keywordsInput.getText().toString());
            Bridge.log(this, "Đổi app theo dõi: " + packagesInput.getText());
            toast("Đã lưu");
            refresh();
        }));

        root.addView(button("Bật quyền đọc thông báo", v ->
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))));

        root.addView(button("Tắt tối ưu pin cho app này", v -> {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e) {
                toast("Máy không có mục này — vào Cài đặt → Pin để tắt thủ công");
            }
        }));

        root.addView(button("Gửi thử", v -> new Thread(() -> {
            try {
                // Cố ý KHÔNG kèm mã TODA-… : chỉ để thử đường truyền và khóa,
                // tuyệt đối không được chốt nhầm đơn nào của khách.
                JSONObject probe = new JSONObject();
                probe.put("packageName", "vn.toda.bankbridge");
                probe.put("postedAt", System.currentTimeMillis());
                probe.put("title", "TODA Bank Bridge");
                probe.put("text", "Gui thu tu app cau noi - khong phai giao dich that");
                Bridge.enqueue(this, probe);
                Bridge.flush(getApplicationContext());
            } catch (Exception e) {
                Bridge.log(this, "Gửi thử lỗi: " + e.getMessage());
            }
            runOnUiThread(this::refresh);
        }).start()));

        root.addView(button("Đẩy lại hàng đợi", v -> new Thread(() -> {
            Bridge.flush(getApplicationContext());
            runOnUiThread(this::refresh);
        }).start()));

        root.addView(button("Xoá nhật ký", v -> {
            Bridge.clearLog(this);
            refresh();
        }));

        TextView ignoredTitle = new TextView(this);
        ignoredTitle.setText("App có thông báo nhưng bị bỏ qua");
        ignoredTitle.setPadding(0, dp(12), 0, dp(2));
        root.addView(ignoredTitle);

        TextView ignoredHint = new TextView(this);
        ignoredHint.setText("Nếu app ngân hàng nằm trong danh sách này, chép tên gói của nó lên ô "
                + "\"App theo dõi\" ở trên. Chỉ lưu tên gói, không lưu nội dung, không gửi đi đâu.");
        ignoredHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        root.addView(ignoredHint);

        ignoredView = new TextView(this);
        ignoredView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        ignoredView.setTypeface(android.graphics.Typeface.MONOSPACE);
        ignoredView.setPadding(0, dp(4), 0, 0);
        root.addView(ignoredView);

        root.addView(button("Xoá danh sách app bỏ qua", v -> {
            Bridge.clearIgnoredPackages(this);
            refresh();
        }));

        TextView logTitle = new TextView(this);
        logTitle.setText("Nhật ký");
        logTitle.setPadding(0, dp(12), 0, dp(4));
        root.addView(logTitle);

        logView = new TextView(this);
        logView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        logView.setTypeface(android.graphics.Typeface.MONOSPACE);
        root.addView(logView);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        askNotificationPermission();
        // Mở app là một dịp dựng lại dịch vụ nổi nếu nó đã bị giết. Gọi nhiều lần
        // vô hại: dịch vụ đang chạy thì lệnh này không tạo thêm gì.
        if (Bridge.isConfigured(this)) BridgeService.start(this);
        refresh();
        // Mở app cũng là một dịp đẩy hàng đợi: bộ hẹn giờ của Android trên máy
        // Xiaomi có thể không bao giờ chạy, nên đừng chỉ trông vào nó.
        if (Bridge.queueSize(this) > 0) {
            new Thread(() -> {
                Bridge.flush(getApplicationContext());
                runOnUiThread(this::refresh);
            }).start();
        }
    }

    private void refresh() {
        boolean configured = Bridge.isConfigured(this);
        boolean access = hasNotificationAccess();
        int queued = Bridge.queueSize(this);

        StringBuilder sb = new StringBuilder();
        sb.append(configured ? "✓ Đã cấu hình: " + Bridge.apiUrl(this) : "✗ CHƯA cấu hình");
        sb.append("\n");
        sb.append(access ? "✓ Đã có quyền đọc thông báo" : "✗ CHƯA bật quyền đọc thông báo");
        sb.append("\n");
        sb.append("Đang chờ gửi: ").append(queued);
        sb.append("\nApp theo dõi: ").append(TextUtils.join(", ", Bridge.allowedPackages(this)));
        sb.append("\nPhiên bản: ").append(Bridge.appVersion(this));
        int dropped = Bridge.droppedCount(this);
        if (dropped > 0) {
            // Con số này tăng mà đơn không chốt = từ khoá đang chặn nhầm.
            sb.append("\nBị từ khoá chặn: ").append(dropped);
        }

        statusView.setText(sb.toString());
        statusView.setTextColor(configured && access ? Color.parseColor("#1B7F3B") : Color.parseColor("#B3261E"));
        // Chỉ nạp lại ô app theo dõi khi người dùng chưa gõ dở, kẻo đang sửa thì bị nuốt mất.
        if (!packagesInput.hasFocus()) {
            packagesInput.setText(TextUtils.join(", ", Bridge.allowedPackages(this)));
        }
        if (!keywordsInput.hasFocus()) {
            keywordsInput.setText(Bridge.keywords(this));
        }
        ignoredView.setText(Bridge.ignoredPackagesText(this));
        logView.setText(Bridge.logText(this));
    }

    private boolean hasNotificationAccess() {
        return Bridge.hasNotificationAccess(this);
    }

    /**
     * Android 13+ đòi xin quyền mới được HIỆN thông báo.
     *
     * Từ chối thì dịch vụ nổi vẫn chạy, chỉ là không thấy thông báo thường trực —
     * mà thiếu nó thì một số máy lại giết tiến trình. Nên hỏi, nhưng không chặn.
     */
    private void askNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT < 33) return;
        try {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1);
            }
        } catch (Exception ignored) {
        }
    }

    private Button button(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(6);
        b.setLayoutParams(lp);
        return b;
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
