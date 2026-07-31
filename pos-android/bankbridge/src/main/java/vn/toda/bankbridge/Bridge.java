package vn.toda.bankbridge;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Cấu hình + hàng đợi + gửi lên máy chủ.
 *
 * Hàng đợi ghi thẳng xuống SharedPreferences chứ KHÔNG giữ trong RAM: Android
 * giết tiến trình nền bất cứ lúc nào, mà mỗi mục nằm đây là một lần khách đã
 * thực sự trả tiền. Mất một mục là một bàn không được dọn.
 */
public final class Bridge {

    private static final String PREFS = "toda_bridge";
    private static final String K_API = "api";
    private static final String K_BRANCH = "branchId";
    private static final String K_KEY = "key";
    private static final String K_PKGS = "pkgs";
    private static final String K_QUEUE = "queue";
    private static final String K_LOG = "log";

    private static final int JOB_ID = 8801;
    /** Chặn hàng đợi phình vô hạn khi máy chủ chết dài ngày. */
    private static final int MAX_QUEUE = 200;
    private static final int MAX_LOG = 20;

    private static final Object LOCK = new Object();

    private Bridge() {
    }

    public static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- cấu hình

    /**
     * Nạp chuỗi cấu hình chép từ trang Cài đặt → Chi nhánh (base64 của JSON).
     * Trả về null nếu chuỗi hỏng, để màn hình chính báo lỗi thay vì lưu bừa.
     */
    public static String applyConfigBlob(Context ctx, String blob) {
        try {
            String json = new String(Base64.decode(blob.trim(), Base64.DEFAULT), StandardCharsets.UTF_8);
            JSONObject o = new JSONObject(json);
            String api = o.optString("api", "").replaceAll("/+$", "");
            String branchId = o.optString("branchId", "");
            String key = o.optString("key", "");
            if (api.isEmpty() || branchId.isEmpty() || key.isEmpty()) return null;

            StringBuilder pkgs = new StringBuilder();
            JSONArray arr = o.optJSONArray("pkgs");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    if (pkgs.length() > 0) pkgs.append(",");
                    pkgs.append(arr.optString(i, "").trim());
                }
            }
            if (pkgs.length() == 0) pkgs.append("com.VCB");

            prefs(ctx).edit()
                    .putString(K_API, api)
                    .putString(K_BRANCH, branchId)
                    .putString(K_KEY, key)
                    .putString(K_PKGS, pkgs.toString())
                    .apply();
            return api;
        } catch (Exception e) {
            return null;
        }
    }

    public static boolean isConfigured(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return !p.getString(K_API, "").isEmpty()
                && !p.getString(K_BRANCH, "").isEmpty()
                && !p.getString(K_KEY, "").isEmpty();
    }

    public static String apiUrl(Context ctx) {
        return prefs(ctx).getString(K_API, "");
    }

    /**
     * Tên gói app ngân hàng được phép gửi đi.
     *
     * Đây là hàng rào riêng tư: mọi thông báo KHÁC trên máy — tin nhắn, Zalo,
     * ảnh — không bao giờ rời khỏi điện thoại.
     */
    public static String[] allowedPackages(Context ctx) {
        String raw = prefs(ctx).getString(K_PKGS, "com.VCB");
        String[] parts = raw.split(",");
        for (int i = 0; i < parts.length; i++) parts[i] = parts[i].trim();
        return parts;
    }

    public static boolean isAllowedPackage(Context ctx, String pkg) {
        if (pkg == null) return false;
        for (String allowed : allowedPackages(ctx)) {
            if (!allowed.isEmpty() && allowed.equalsIgnoreCase(pkg)) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- hàng đợi

    public static void enqueue(Context ctx, JSONObject item) {
        synchronized (LOCK) {
            JSONArray queue = readArray(ctx, K_QUEUE);
            queue.put(item);
            // Bỏ mục cũ nhất khi tràn — mục cũ nhất cũng là mục ít cứu được nhất
            // (phiếu đã quá hạn 60 phút thì máy chủ cũng từ chối).
            while (queue.length() > MAX_QUEUE) queue.remove(0);
            writeArray(ctx, K_QUEUE, queue);
        }
    }

    public static int queueSize(Context ctx) {
        synchronized (LOCK) {
            return readArray(ctx, K_QUEUE).length();
        }
    }

    /**
     * Đẩy hết hàng đợi. Gặp mục nào gửi hỏng thì DỪNG và giữ nguyên phần còn
     * lại — thường là mất mạng hoặc máy chủ sập, cố thêm chỉ tốn pin.
     *
     * @return true nếu đã đẩy sạch.
     */
    public static boolean flush(Context ctx) {
        if (!isConfigured(ctx)) return false;
        while (true) {
            JSONObject head;
            synchronized (LOCK) {
                JSONArray queue = readArray(ctx, K_QUEUE);
                if (queue.length() == 0) return true;
                head = queue.optJSONObject(0);
                if (head == null) {
                    queue.remove(0);
                    writeArray(ctx, K_QUEUE, queue);
                    continue;
                }
            }

            int code = post(ctx, head);
            if (code >= 200 && code < 300) {
                synchronized (LOCK) {
                    JSONArray queue = readArray(ctx, K_QUEUE);
                    if (queue.length() > 0) queue.remove(0);
                    writeArray(ctx, K_QUEUE, queue);
                }
                log(ctx, "Đã gửi: " + shorten(head.optString("text")));
            } else {
                // 401 cũng giữ lại: sai khóa là lỗi cấu hình, sửa xong phải đẩy
                // được hết chỗ tiền đã nhận chứ không được vứt đi.
                log(ctx, "Gửi hỏng (" + (code == 0 ? "mất mạng" : "HTTP " + code)
                        + "), còn " + queueSize(ctx) + " chờ");
                scheduleRetry(ctx);
                return false;
            }
        }
    }

    /** @return mã HTTP, hoặc 0 nếu không nối được. */
    private static int post(Context ctx, JSONObject item) {
        SharedPreferences p = prefs(ctx);
        HttpURLConnection conn = null;
        try {
            URL url = new URL(p.getString(K_API, "") + "/api/payments/webhooks/bank-push");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("X-Toda-Branch", p.getString(K_BRANCH, ""));
            conn.setRequestProperty("X-Toda-Bridge-Key", p.getString(K_KEY, ""));
            OutputStream os = conn.getOutputStream();
            os.write(item.toString().getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();
            return conn.getResponseCode();
        } catch (Exception e) {
            return 0;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Hẹn thử lại khi có mạng trở lại. */
    public static void scheduleRetry(Context ctx) {
        try {
            JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, RetryJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .setMinimumLatency(30_000)
                    .setOverrideDeadline(15 * 60_000)
                    .build();
            js.schedule(job);
        } catch (Exception ignored) {
        }
    }

    // ---------------------------------------------------------------- nhật ký

    public static void log(Context ctx, String line) {
        synchronized (LOCK) {
            JSONArray log = readArray(ctx, K_LOG);
            log.put(android.text.format.DateFormat.format("HH:mm:ss", System.currentTimeMillis())
                    + "  " + line);
            while (log.length() > MAX_LOG) log.remove(0);
            writeArray(ctx, K_LOG, log);
        }
    }

    public static String logText(Context ctx) {
        synchronized (LOCK) {
            JSONArray log = readArray(ctx, K_LOG);
            StringBuilder sb = new StringBuilder();
            for (int i = log.length() - 1; i >= 0; i--) sb.append(log.optString(i)).append("\n");
            return sb.length() == 0 ? "(chưa có gì)" : sb.toString();
        }
    }

    public static void clearLog(Context ctx) {
        prefs(ctx).edit().remove(K_LOG).apply();
    }

    // ---------------------------------------------------------------- tiện ích

    private static JSONArray readArray(Context ctx, String key) {
        try {
            return new JSONArray(prefs(ctx).getString(key, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static void writeArray(Context ctx, String key, JSONArray arr) {
        prefs(ctx).edit().putString(key, arr.toString()).apply();
    }

    private static String shorten(String s) {
        if (s == null) return "";
        return s.length() <= 60 ? s : s.substring(0, 60) + "…";
    }
}
