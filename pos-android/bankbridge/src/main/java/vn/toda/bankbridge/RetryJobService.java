package vn.toda.bankbridge;

import android.app.job.JobParameters;
import android.app.job.JobService;

/**
 * Đẩy lại hàng đợi khi có mạng trở lại.
 *
 * Cần thiết vì thông báo ngân hàng thường đến đúng lúc quán đông, mạng chập
 * chờn; không có bước thử lại thì tiền đã vào mà đơn treo mãi.
 */
public class RetryJobService extends JobService {

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            boolean done = Bridge.flush(getApplicationContext());
            // done=false → Bridge.flush đã tự hẹn lượt sau, nên báo hệ thống là
            // xong việc lần này thay vì để nó tự thử lại chồng lên.
            jobFinished(params, false);
            if (!done) Bridge.scheduleRetry(getApplicationContext());
        }).start();
        return true; // còn chạy trên luồng nền
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // hệ thống cắt ngang → cho chạy lại
    }
}
