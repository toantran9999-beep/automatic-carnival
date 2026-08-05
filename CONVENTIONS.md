# CONVENTIONS.md — Viết code TODA POS thế nào cho đúng chuẩn

> Ba file tài liệu, ba việc khác nhau — đừng chép lẫn nhau:
> - [AGENTS.md](AGENTS.md) = **quy trình** (git, deploy, database, bí mật)
> - [ARCHITECTURE.md](ARCHITECTURE.md) = **bản đồ code** + gotcha đã trả giá
> - **File này = viết code thế nào cho đúng chuẩn**

Dự án có **nhiều agent + nhiều máy** cùng sửa. Không có bản chuẩn thì mỗi agent
nghĩ một kiểu, và những chỗ lệch dưới đây sẽ đẻ thêm.

Mỗi luật ở đây đều kèm **lý do** và **chỗ đã sai thật**. Luật không có lý do là
luật sẽ bị bỏ qua.

---

## 1. Vỏ phản hồi API

Mọi endpoint trả đúng một trong hai dạng:

```ts
{ success: true,  data: ... }
{ success: false, error: { code, message } }
```

### ⚠️ Luật quan trọng nhất: mọi thứ khách cần đọc phải nằm TRONG `data`

`apiFetch` ([apps/web/src/lib/fetcher.ts](apps/web/src/lib/fetcher.ts)) trả về
**đúng `json.data`**. Cái gì để ngoài là **mất trắng**.

**Đã trả giá:** `pagination` từng để ngoài `data`, nên `use-orders.ts` buộc phải
tự viết `fetch` riêng — và bản tự viết đó **thiếu phần tự làm mới phiên**. Hết
hạn token là **riêng trang Đơn hàng chết** trong khi mọi trang khác vẫn chạy,
cực khó đoán nguyên nhân. Đã vá 2026-07-27.

Dạng phân trang duy nhất:

```ts
data: { <tên số nhiều>: [...], pagination: { page, limit, total, totalPages } }
```

`totalPages` **luôn có**, kể cả khi rỗng (`0`) — đừng để bên gọi phải tự đoán.

---

## 2. Báo lỗi

**Hiện trạng:** `AppError` có sẵn ở
[middleware/error-handler.ts](apps/api/src/middleware/error-handler.ts) nhưng
**chưa route nào dùng** — 20 route đang viết tay ~181 chỗ
`return c.json({ success: false, ... }, 4xx)`.

**Luật cho code mới:** lỗi nghiệp vụ thì **ném `AppError(code, message, status)`**.
Lợi: mã lỗi và mã HTTP nằm cùng một chỗ, không lệch nhau.

⚠️ **Cái bẫy đang có:** `KNOWN_ERROR_CODES` khớp lỗi bằng cách **so chuỗi**
`err.message`. Service ném `new Error("TABLE_NOT_FOUND")` mà quên thêm mã vào
bảng đó thì ra **lỗi 500 "Lỗi máy chủ"** — người dùng không hiểu gì, còn mình thì
tìm mãi không ra. Nên **service cũng dùng `AppError`**, đừng ném `Error` chuỗi trần.

Không phải sửa lại 181 chỗ cũ. Sửa dần khi có dịp đụng vào file nào.

---

## 3. Đường dẫn & phân quyền

- Đặt tên: `/api/<danh-từ-số-nhiều>`, gạch nối. Con nằm dưới cha:
  `POST /orders/:id/items`.
- Động từ: `GET` đọc · `POST` tạo · `PATCH` sửa một phần · `DELETE` xoá.
  **Không dùng `PUT`.**
- Mỗi route **bắt buộc** khai `requirePermission(...)`.

### ⚠️ Quyền thôi là KHÔNG ĐỦ

`PATCH /tables/:id` (đổi tên bàn — cài đặt, **cho phép** quản lý) và
`PATCH /tables/:id/status` (dữ liệu đang bán, **chặn** quản lý) dùng **chung
quyền** `tables:update`. Nên phải chặn thêm **theo từng đường dẫn** bằng
`blockLiveOps` ([middleware/rbac.ts](apps/api/src/middleware/rbac.ts)).

Route nào **chạm dữ liệu đang chảy** (đơn, bàn, thanh toán, ca) thì gắn
`blockLiveOps`.

### Sửa quyền một vai trò = sửa 3 nơi

1. `PERMISSIONS` — [packages/config/src/index.ts](packages/config/src/index.ts)
2. `allowedPaths` — [(dashboard)/layout.tsx](apps/web/src/app/(dashboard)/layout.tsx) (lọc menu)
3. **Lớp chặn đường dẫn** trong cùng file đó

⚠️ `allowedPaths` **trước đây chỉ lọc menu, không chặn gì** — ẩn mục xong gõ
thẳng `/payments` vẫn vào bình thường. Đã thêm lớp chặn thật (so **tiền tố**, nên
`/settings/floor` tính là `/settings`; có chống lặp vô hạn).

### ⚠️ Ẩn dữ liệu nhạy cảm phải ẩn Ở MÁY CHỦ

Lọc ở giao diện là **vô nghĩa**: dữ liệu vẫn nằm trong bộ nhớ trình duyệt, mở
công cụ nhà phát triển là xem được.

Hai ví dụ thật trong repo:
- `GET /payments/summary` đổi sang đòi quyền `reports:read` — vì **thu ngân và
  phục vụ đều có `payments:read`** để thu tiền, để quyền đó là hở doanh thu cả ngày.
- `GET /tables?layout=1` **thoát sớm** trước khi truy vấn phiên bàn/đơn/món, để
  tên khách và số tiền **không rời máy chủ** cho màn Sơ đồ bàn của quản lý.

---

## 4. Gọi API từ web

- **Luôn dùng `apiFetch`**. Nó lo token, **tự làm mới phiên**, gắn `x-branch-id`.
  Tự `fetch` là mất hết những thứ đó — xem bài học ở mục 1.
- Mọi lệnh gọi gói trong hook `use-*.ts`, **không gọi thẳng trong component**.
- ⚠️ Khoá `queryKey` phải **kèm `branchId`** khi dữ liệu theo chi nhánh, kẻo đổi
  chi nhánh vẫn thấy dữ liệu chi nhánh cũ.
- ⚠️ Hai màn đọc **cùng một bảng nhưng khác mức chi tiết** thì phải dùng **hai
  khoá cache khác nhau**. Ví dụ `useTables` (đầy đủ) vs `useTablesLayout`
  (`["tables-layout"]`, không có dữ liệu khách): dùng chung khoá là bản rút gọn
  đè lên bản đầy đủ, thẻ bàn mất tên khách và số tiền. Đổi dữ liệu thì nhớ **làm
  mới cả hai** (`invalidateTableSetup` trong `use-tables.ts`).

---

## 5. Giao diện

### Dùng đồ có sẵn, đừng vẽ lại

| Cần gì | Dùng cái này |
|---|---|
| Nút gạt bật/tắt | `Switch` — `@restai/ui/components/switch` |
| Ô xám lúc chờ | `Skeleton` — `@restai/ui/components/skeleton` |
| Tiêu đề trang | `PageHeader` — `@/components/page-header` |
| Một dòng cài đặt | `SettingSection` / `SettingRow` / `SettingsSaveBar` — `@/components/settings/setting-row` |
| Tab | `Tabs` — `@restai/ui/components/tabs` |

**Vì sao có mục này:** nút gạt từng bị **chép tay 8 lần** ở 5 file, `Skeleton`
định nghĩa lại **32 file**, thanh tab ở Cài đặt vẽ tay bằng nút bấm trong khi app
có sẵn `Tabs`. Mỗi bản chép một dáng — đó chính là cái làm giao diện trông chắp vá.

**Thêm một cài đặt mới = khai báo, không vẽ lại:**

```tsx
<SettingSection title="…" description="…">
  <SettingRow label="…" help="…">
    <Switch checked={x} onCheckedChange={setX} />
  </SettingRow>
</SettingSection>
```

### Màu

Chỉ dùng **token**: `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`…
Không màu cứng kiểu `bg-slate-800`. Đổi màu nhấn thì sửa `--accent-runtime`
(globals.css) hoặc `ACCENTS` (theme-store).

### Chữ đa ngôn ngữ

Chỉ dùng `t("khóa")`. **Không viết `lang === "vi" ? … : …`** trong giao diện.
Hiện còn **369 chỗ** viết tay, nặng nhất là `loyalty/_components/programs-tab.tsx`
và `tables/page.tsx` — sửa dần khi đụng vào.

⚠️ Tuyệt đối **không đoán ngôn ngữ bằng cách so chuỗi đã dịch** (kiểu
`t("common.actions") !== "Actions"`). Còn một chỗ như vậy trong
`menu/_components/modifier-group-dialog.tsx`, phải bỏ.

### Vùng bấm trên máy POS

Máy quầy bấm bằng **ngón tay**, không phải chuột. Mọi thứ bấm được phải có vùng
bấm **tối thiểu 44×44px**. Nút gạt cũ chỉ cao 24px nên nhân viên bấm trượt thật —
`Switch` mới giữ hình 24×44 nhưng nới vùng bấm ra 44×44 bằng lớp đệm trong suốt.

---

## 6. Năm cái bẫy đã trả giá — đọc kỹ

### 💰 "Còn nợ bao nhiêu" CHỈ được hỏi `dueBreakdown()`

Một câu hỏi, một nơi trả lời. Muốn biết một đơn hay một bàn còn phải trả bao nhiêu
thì gọi `dueBreakdown()` trong `routes/payments.ts` — **tuyệt đối không tự cộng lại
ở chỗ khác**, dù chỉ hai dòng.

Sáng **05/08/2026 bàn 13**: phiếu QR in ra liệt kê **85.000đ** tiền món nhưng dòng
**TỔNG CẦN TRẢ ghi 70.000đ**. Khách chuyển đúng 70.000đ theo tờ phiếu, rồi máy chủ
**từ chối chốt** vì bàn nợ 85.000đ. Bàn treo 31 phút, cuối cùng bấm tay.

Nguyên nhân: **ba** chỗ cùng trả lời câu hỏi đó, mỗi chỗ một kiểu.

| Chỗ | Tính kiểu gì | Ra số |
|---|---|---|
| máy POS gửi lên | đọc bộ nhớ đệm trên máy, có thể đã cũ | 70.000 |
| gom món để in | "cho đơn vào rồi mới trừ tiền" → lấy trọn đơn cuối | 85.000 |
| lúc nhận tiền | tổng nợ cả bàn | 85.000 |

Ba luật rút ra, đừng phá:

1. **Số tiền do máy chủ tính.** Máy khách gửi số nào cũng chỉ để ghi log khi lệch —
   nó đọc từ bộ nhớ đệm nên không đáng tin.
2. **Phiếu in không được tự mâu thuẫn.** `Tạm tính + Thuế = TỔNG CẦN TRẢ`, và
   `subtotal` phải **suy ngược từ** tổng chứ không cộng độc lập.
3. **Vòng lặp "gom tới khi hết tiền" là bẫy.** Kiểm *đơn này có vừa túi không* rồi
   mới lấy, đừng *lấy rồi mới trừ*.

Chốt chặn hiện có, đủ ba lớp: máy chủ tự tính lúc dựng phiếu → `GET /requests/:id`
tự huỷ phiếu khi số tiền đổi (hộp thoại hỏi lại mỗi 5 giây) → lúc tiền về so lần
nữa và bắn `payment:mismatch` cho thu ngân.

⚠️ Chốt chặn đặt ở đường **ĐỌC**, cố ý không gắn vào từng chỗ sửa món. Gắn từng chỗ
thì quên một chỗ là lỗi quay lại, mà quên chỗ nào cũng không ai biết cho tới lúc có
khách chuyển tiền hụt.

### `sm:` / `md:` đo MÀN HÌNH, không đo khung chứa

Trong hộp thoại, thẻ, ngăn bên — chúng là **sai công cụ**. `DialogFooter` xếp nút
ngang bằng `sm:flex-row`; máy POS màn rộng nên `sm:` bật, trong khi hộp thoại chỉ
`max-w-md`. Nhồi 3 nút vào là tràn ra ngoài.

**Đúng:** hộp thoại ≥3 nút thì xếp **dọc** bằng `<div className="flex flex-col gap-2">`,
đừng sửa `DialogFooter` dùng chung.

### Khoá một chiều `overflow` thì chiều kia TỰ thành `auto`

Luật CSS. Hậu quả đã gặp **2 lần**:
1. `DialogContent` có `overflow-y-auto` → trượt ngang được → **cắt cụt chữ mà im
   lặng**, mất số tiền Tổng cộng trên máy POS mà không ai biết.
2. `<main>` có `overflow-y-auto` → thành khung cuộn ngang → `scrollIntoView`
   **cuộn mọi khung cha** nên kéo lệch NGANG cả trang.

**Đúng:** thêm `overflow-x-hidden` cho hộp thoại. Trong khung trượt ngang thì đặt
thẳng `scrollLeft`, **không dùng `scrollIntoView`**:

```ts
box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
```

⚠️ Đừng vá bằng `overflow-x-hidden` cho `<main>` — sẽ cắt cụt các trang có bảng rộng.

Hàng "nhãn — số tiền": `min-w-0` cho nhãn + `shrink-0` cho số, để nhãn co trước
và **số tiền không bao giờ bị đẩy ra ngoài**. `SettingRow` đã làm sẵn.

### `h-screen` / `100vh` nuốt mất hàng cuối trên Android

Dùng **`h-dvh`**, và đệm dưới phải cộng `env(safe-area-inset-bottom)`.

### `dark:` từng ăn theo hệ điều hành

Tailwind v4 mặc định cho `dark:` chạy theo `prefers-color-scheme`, nhưng app đổi
giao diện bằng **nút Sáng/Tối riêng** (class `.dark` trên thẻ gốc). Đã khai
`@custom-variant dark (&:where(.dark, .dark *));` ở đầu `globals.css` — **đừng xoá**,
xoá là 236 chỗ `dark:` lại chạy sai.

---

## 7. PWA & máy POS Android

⚠️ Đổi chiến lược cache trong `apps/web/public/sw.js` thì **phải tăng số bản**
`toda-pos-shell-vN`, kẻo máy đã cài PWA giữ mãi bản cũ.

Deploy web xong máy POS báo **"Failed to load chunk"** = kẹt cache, không phải máy
hỏng. App đã tự chữa; máy kẹt từ trước bản vá thì xoá bộ nhớ đệm app bằng tay.
Chi tiết ở [ARCHITECTURE.md](ARCHITECTURE.md) mục 8.

---

## 8. Còn nợ (sửa dần, không làm một lần)

| Việc | Quy mô |
|---|---|
| 369 chỗ `lang === "vi"` → `t()` | ~25 file, làm theo từng file khi đụng vào |
| 181 chỗ báo lỗi viết tay → `AppError` | 20 route, làm dần |
| 30 file còn tự định nghĩa `Skeleton` | thay khi đụng vào |
| 3 chỗ còn `role="switch"` vẽ tay → `Switch` | connections, device-tab, tables |
| Món tùy chọn (`menu/_components/`): nút ↑↓ chép đôi ở 2 chỗ, ô tích thô của trình duyệt, min/max không chặn cấu hình vô lý (tối thiểu 2 mà tối đa 1), đoán ngôn ngữ bằng so chuỗi | một đợt riêng |
| `kitchen/page.tsx` chưa dùng `PageHeader` | cố ý hoãn — bố cục full-height, mà KDS đang tắt |
