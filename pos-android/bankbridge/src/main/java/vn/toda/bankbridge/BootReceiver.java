package vn.toda.bankbridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Máy khởi động lại thì đẩy nốt những gì còn kẹt trong hàng đợi. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (Bridge.queueSize(ctx) > 0) Bridge.scheduleRetry(ctx);
    }
}
