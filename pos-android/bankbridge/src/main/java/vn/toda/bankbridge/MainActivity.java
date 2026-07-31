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
    private TextView statusView;
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
        refresh();
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

        statusView.setText(sb.toString());
        statusView.setTextColor(configured && access ? Color.parseColor("#1B7F3B") : Color.parseColor("#B3261E"));
        logView.setText(Bridge.logText(this));
    }

    /**
     * Có quyền đọc thông báo chưa. Phải tự đọc danh sách của hệ thống vì Android
     * không cho hỏi quyền này bằng hộp thoại như quyền thường.
     */
    private boolean hasNotificationAccess() {
        try {
            String enabled = Settings.Secure.getString(
                    getContentResolver(), "enabled_notification_listeners");
            return enabled != null && enabled.contains(getPackageName());
        } catch (Exception e) {
            return false;
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
