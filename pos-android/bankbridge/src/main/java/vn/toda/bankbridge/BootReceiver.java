package vn.toda.bankbridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Máy khởi động lại thì dựng lại dịch vụ nổi và đẩy nốt hàng đợi.
 *
 * Không dựng lại dịch vụ ở đây thì mất điện một lần là cầu nối im cho tới khi có
 * người nhớ ra mà mở app — mà chẳng ai nhớ, vì nó im không báo gì cả.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (Bridge.isConfigured(ctx)) BridgeService.start(ctx);
        if (Bridge.queueSize(ctx) > 0) Bridge.scheduleRetry(ctx);
    }
}
