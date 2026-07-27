import { redirect } from "next/navigation";

/**
 * `/settings` không còn nội dung riêng — mỗi mục cài đặt là một đường dẫn thật
 * (xem `settings/layout.tsx`). Đưa thẳng về mục đầu để không ai gặp trang trắng,
 * và để link `/settings` cũ trong menu vẫn chạy.
 */
export default function SettingsIndexPage() {
  redirect("/settings/shop");
}
