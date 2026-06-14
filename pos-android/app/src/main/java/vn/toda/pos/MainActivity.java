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
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
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

    private WebView webView;
    private UsbManager usbManager;

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
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
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
    private synchronized boolean writeToPrinter(byte[] data) {
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
                if (sent < 0) { toast("Gửi máy in lỗi"); return false; }
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
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
    }

    /** Cầu JS: web gọi window.TodaPrintBridge.printBase64(...) */
    class PrintBridge {
        @JavascriptInterface
        public void printBase64(String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                writeToPrinter(data);
            } catch (Exception e) {
                toast("In lỗi: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void print(String json) {
            try {
                JSONObject o = new JSONObject(json);
                printBase64(o.optString("data"));
            } catch (Exception e) {
                toast("In lỗi: " + e.getMessage());
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
