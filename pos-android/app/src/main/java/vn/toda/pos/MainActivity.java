package vn.toda.pos;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.HashMap;

/**
 * Vỏ Android cho TODA POS chạy ở quầy.
 * - Nạp thẳng web POS trong WebView (toàn màn hình, giữ màn luôn sáng).
 * - Phơi window.TodaPrintBridge.printBase64(...) để web (driver android_bridge)
 *   in TRỰC TIẾP ra máy in Gprinter qua USB (ESC/POS thô), không qua RawBT.
 */
public class MainActivity extends Activity {

    private static final String TAG = "TodaPos";
    private static final String POS_URL = "https://pos.14.225.212.172.nip.io";
    private static final String ACTION_USB_PERMISSION = "vn.toda.pos.USB_PERMISSION";

    /** Khoảng nghỉ tối thiểu giữa hai tờ phiếu (ms). */
    private static final long PRINT_GAP_MS = 300;

    private WebView webView;
    private UsbManager usbManager;
    private volatile long lastPrintAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(usbReceiver, filter);
        }

        WebView.setWebContentsDebuggingEnabled(true);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setLoadsImagesAutomatically(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) {
                    toast("Lỗi tải trang: " + err.getErrorCode() + " " + err.getDescription());
                }
            }
            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse resp) {
                if (req != null && req.isForMainFrame()) {
                    toast("HTTP " + resp.getStatusCode() + " khi tải trang");
                }
            }
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Báo lỗi SSL (vd đồng hồ máy sai) thay vì im lặng treo trắng.
                toast("Lỗi bảo mật SSL: " + error.getPrimaryError() + " — kiểm tra ngày giờ máy");
                handler.cancel();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                if (cm.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    String m = cm.message();
                    toast("JS lỗi: " + (m.length() > 160 ? m.substring(0, 160) : m));
                }
                return super.onConsoleMessage(cm);
            }
        });
        webView.addJavascriptInterface(new PrintBridge(), "TodaPrintBridge");

        setContentView(webView);
        webView.loadUrl(POS_URL);

        requestPrinterPermission();
    }

    /** Tìm máy in USB: ưu tiên interface class 7 (Printer), nếu không có thì
     *  lấy thiết bị nào có endpoint bulk OUT. */
    private UsbDevice findPrinter() {
        if (usbManager == null) return null;
        HashMap<String, UsbDevice> list = usbManager.getDeviceList();
        UsbDevice fallback = null;
        for (UsbDevice d : list.values()) {
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                UsbInterface intf = d.getInterface(i);
                if (intf.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) {
                    return d;
                }
                for (int e = 0; e < intf.getEndpointCount(); e++) {
                    UsbEndpoint ep = intf.getEndpoint(e);
                    if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                            && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                        fallback = d;
                    }
                }
            }
        }
        return fallback;
    }

    private void requestPrinterPermission() {
        UsbDevice d = findPrinter();
        if (d == null || usbManager.hasPermission(d)) return;
        int flags = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(
                this, 0,
                new Intent(ACTION_USB_PERMISSION).setPackage(getPackageName()),
                flags);
        usbManager.requestPermission(d, pi);
    }

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(i.getAction())) {
                requestPrinterPermission();
            }
        }
    };

    /** Ghi ESC/POS thô ra máy in qua USB bulk OUT. */
    /**
     * Gửi một tờ phiếu xuống máy in.
     *
     * ⚠️ `synchronized` + nghỉ giữa hai lượt: chế độ "mỗi ly một phiếu" bắn 2-3
     * lệnh in liên tiếp không nghỉ. Máy in còn đang nhả tờ trước thì tờ sau rớt,
     * mà bên web lại tưởng in xong hết — đó chính là kiểu mất phiếu "đơn 3 ly ra
     * 1 tờ" gặp sáng 03/09/2026.
     */
    private synchronized boolean writeToPrinter(byte[] data) {
        long since = System.currentTimeMillis() - lastPrintAt;
        if (since < PRINT_GAP_MS) {
            try { Thread.sleep(PRINT_GAP_MS - since); } catch (InterruptedException ignored) {}
        }
        try {
            return writeToPrinterOnce(data);
        } finally {
            lastPrintAt = System.currentTimeMillis();
        }
    }

    private boolean writeToPrinterOnce(byte[] data) {
        UsbDevice d = findPrinter();
        if (d == null) { toast("Không thấy máy in USB"); return false; }
        if (!usbManager.hasPermission(d)) {
            requestPrinterPermission();
            toast("Đang xin quyền máy in USB — in lại sau khi cho phép");
            return false;
        }

        UsbInterface target = null;
        UsbEndpoint out = null;
        for (int i = 0; i < d.getInterfaceCount() && out == null; i++) {
            UsbInterface ui = d.getInterface(i);
            for (int e = 0; e < ui.getEndpointCount(); e++) {
                UsbEndpoint ep = ui.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                        && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    target = ui;
                    out = ep;
                    break;
                }
            }
        }
        if (out == null) { toast("Máy in không có cổng dữ liệu USB"); return false; }

        UsbDeviceConnection conn = usbManager.openDevice(d);
        if (conn == null) { toast("Không mở được máy in"); return false; }
        try {
            conn.claimInterface(target, true);
            final int chunk = 16384;
            int offset = 0;
            while (offset < data.length) {
                int len = Math.min(chunk, data.length - offset);
                byte[] buf = new byte[len];
                System.arraycopy(data, offset, buf, 0, len);
                int sent = conn.bulkTransfer(out, buf, len, 5000);
                if (sent < 0) {
                    // Thử lại một lần: máy in bận nhả tờ trước là hay trượt đúng
                    // nhịp này. Trượt lần hai mới thực sự là hỏng.
                    try { Thread.sleep(400); } catch (InterruptedException ignored) {}
                    sent = conn.bulkTransfer(out, buf, len, 5000);
                }
                if (sent < 0) { toast("Gửi máy in lỗi — phiếu KHÔNG ra"); return false; }
                offset += len;
            }
            return true;
        } catch (Exception ex) {
            Log.e(TAG, "writeToPrinter", ex);
            toast("In lỗi: " + ex.getMessage());
            return false;
        } finally {
            try { conn.releaseInterface(target); } catch (Exception ignored) {}
            conn.close();
        }
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
    }

    /**
     * Cầu JS: web gọi window.TodaPrintBridge.printBase64(...)
     *
     * ⚠️ TRẢ VỀ boolean, và web PHẢI đọc giá trị đó.
     *
     * Bản cũ khai `void` rồi vứt luôn kết quả `writeToPrinter`: không thấy máy
     * in, chưa có quyền USB, gửi lỗi — tất cả chỉ hiện Toast 2 giây rồi thôi,
     * còn web thì mặc định coi như đã in. Suốt thời gian đó không ai biết phiếu
     * nào không ra giấy. Đây là gốc của sự im lặng.
     */
    class PrintBridge {
        @JavascriptInterface
        public boolean printBase64(String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                return writeToPrinter(data);
            } catch (Exception e) {
                toast("In lỗi: " + e.getMessage());
                return false;
            }
        }

        @JavascriptInterface
        public boolean print(String json) {
            try {
                JSONObject o = new JSONObject(json);
                return printBase64(o.optString("data"));
            } catch (Exception e) {
                toast("In lỗi: " + e.getMessage());
                return false;
            }
        }

        @JavascriptInterface
        public boolean isReady() {
            return findPrinter() != null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(usbReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
