# Nhập 14 SKU bán sỉ vào thực đơn

Dữ liệu thô: [`sku-si-can-nhap.csv`](./sku-si-can-nhap.csv)
Nguồn giá: `toda-agent/knowledge/kien_thuc_thuc_te_bao_mat_cao/bang-gia-b2b-TODA.pdf`

## Vì sao

Tờ rơi bán sỉ có **4 loại × 3 bậc = 12 mặt hàng**, nhưng thực đơn POS chỉ bấm được 6. Gặp khách sỉ là nhân viên phải **gõ tay cả tên lẫn giá**.

Đơn 1,9 triệu gần nhất bị gõ thành `Cà phê Toda 1 (10kh)` — thiếu chữ "g", và đã in ra phiếu giao khách. Gõ tay số tiền 1.900.000đ cũng không có gì chặn nếu bấm nhầm.

Giá trong POS hiện **khớp 100% với tờ rơi**, không lệch một đồng — nên chỉ cần thêm bậc còn thiếu, không phải sửa giá nào.

## Ánh xạ tên

| Tên trong POS | Tên trên tờ rơi | Giá mỗi kg |
|---|---|---|
| Toda 1 | Mạnh Mẽ (100% Robusta Đắk Lắk) | 220.000đ |
| Toda 2 | Đậm Nhẹ (80% Robusta + 20% mật ong) | 240.000đ |
| Toda 3 | Cân Bằng (60% Robusta + 40% mật ong) | 260.000đ |
| Toda 4 | Ngọt Ngào (100% Robusta mật ong) | 300.000đ |

## Danh sách nhập

Vào **Thực đơn → danh mục CÀ PHÊ BỘT HẠT**. Dòng ✅ là đã có sẵn, chỉ để anh thấy thứ tự cuối cùng. Dòng **➕ là cần thêm**.

| # | Tên món | Giá | Đơn vị | |
|---|---|---|---|---|
| 0 | Cà phê Toda 1 (250g) | 55.000đ | Túi | ✅ |
| 1 | Cà phê Toda 1 (500g) | 110.000đ | Túi | ✅ |
| 2 | **Cà phê Toda 1 (1kg)** | **220.000đ** | Túi | ➕ |
| 3 | Cà phê Toda 1 (3kg) | 630.000đ | Đơn | ✅ |
| 4 | **Cà phê Toda 1 (sỉ từ 10kg - đ/kg)** | **190.000đ** | Kg | ➕ |
| 5 | **Cà phê Toda 2 (250g)** | **60.000đ** | Túi | ➕ |
| 6 | Cà phê Toda 2 (500g) | 120.000đ | Túi | ✅ |
| 7 | **Cà phê Toda 2 (1kg)** | **240.000đ** | Túi | ➕ |
| 8 | **Cà phê Toda 2 (3kg)** | **690.000đ** | Đơn | ➕ |
| 9 | **Cà phê Toda 2 (sỉ từ 10kg - đ/kg)** | **210.000đ** | Kg | ➕ |
| 10 | **Cà phê Toda 3 (250g)** | **65.000đ** | Túi | ➕ |
| 11 | Cà phê Toda 3 (500g) | 130.000đ | Túi | ✅ |
| 12 | **Cà phê Toda 3 (1kg)** | **260.000đ** | Túi | ➕ |
| 13 | **Cà phê Toda 3 (3kg)** | **750.000đ** | Đơn | ➕ |
| 14 | **Cà phê Toda 3 (sỉ từ 10kg - đ/kg)** | **230.000đ** | Kg | ➕ |
| 15 | **Cà phê Toda 4 (250g)** | **75.000đ** | Túi | ➕ |
| 16 | Cà phê Toda 4 (500g) | 150.000đ | Túi | ✅ |
| 17 | **Cà phê Toda 4 (1kg)** | **300.000đ** | Túi | ➕ |
| 18 | **Cà phê Toda 4 (3kg)** | **870.000đ** | Đơn | ➕ |
| 19 | **Cà phê Toda 4 (sỉ từ 10kg - đ/kg)** | **270.000đ** | Kg | ➕ |

Thứ tự trong cột `#` chỉ là gợi ý (mỗi loại xếp từ nhỏ tới lớn). Nhập xong kéo thả lại trên trang Thực đơn nếu muốn khác.

## Cách bậc sỉ hoạt động

Bốn dòng "sỉ từ 10kg" bán theo **đơn giá mỗi kg**, còn **số lượng chính là số kg**:

```
Cà phê Toda 1 (sỉ từ 10kg - đ/kg)  ×  10  =  1.900.000đ
Cà phê Toda 1 (sỉ từ 10kg - đ/kg)  ×  15  =  2.850.000đ
```

Làm vậy thì một dòng lo được mọi mức 10kg, 12kg, 15kg — không phải đẻ ra SKU riêng cho từng mức. Và 10kg ra đúng 1.900.000đ, bằng đơn đã bán trước đây.

⚠️ Tên phải giữ chữ **"sỉ từ 10kg"** để nhân viên không lỡ bán 3kg bằng giá sỉ. Ai mua dưới 10kg thì dùng dòng 1kg hoặc 3kg.

## Hai chỉnh nhỏ cũng làm luôn trên giao diện

### ✅ a) Nhóm "Đóng gói" → bật **bắt buộc**

Tờ rơi hứa *"quán xay sẵn miễn phí"*, nhưng 3 ngày qua nhóm này **chỉ được bấm 2 lần**. Nhóm đã gắn sẵn cho các món bột hạt rồi, chỉ là đang cho phép bỏ qua.

Vào **Thực đơn → Nhóm tuỳ chọn → Đóng gói** → bật *Bắt buộc*, đặt *chọn tối thiểu* = 1.

An toàn, vì cả hai lựa chọn (Hạt, Bột) đều **0đ** — không làm đội giá đơn nào.

Nhớ **gắn nhóm "Đóng gói" cho cả 14 món mới**.

### ✅ b) Nhóm "Loại hạt" → kéo lên **đầu danh sách**

Nhóm này đã gắn cho cả 19 món cà phê, nhưng đang nằm **thứ 5 trong 6 nhóm**. Bán một ly cà phê đá thì phải cuộn qua Độ đậm → Đường → Sữa đặc → Đá mới thấy nó. Lúc 7h sáng 89 đơn/giờ thì không ai cuộn tới.

Kết quả: **1,7% khách chạm tới nhóm này, ba loại hạt đặc sản 0 lượt trong 3 ngày.**

Vào **Thực đơn → Nhóm tuỳ chọn** → kéo "Loại hạt" lên trên cùng.

Tham khảo: hồi còn bán cà phê rời, khách chọn **Cân Bằng 52% · Đậm Nhẹ 37% · Mạnh Mẽ 8% · Ngọt Ngào 2%**.

## 🔴 Một chỗ tuyệt đối đừng đụng

**ĐỪNG bật "Bắt buộc" cho nhóm "Loại hạt".**

Khi một nhóm được đặt bắt buộc + chỉ chọn 1, POS **tự chọn sẵn lựa chọn đầu tiên**. Nhóm "Loại hạt" có 5 lựa chọn và **không cái nào 0đ** — cái đầu tiên là **Mix +4.000đ**.

Bật bắt buộc = **mọi ly cà phê tự động cộng thêm 4.000đ**, kể cả khi nhân viên không bấm gì.

Chỉ kéo thứ tự. Đừng đụng ô "Bắt buộc" của nhóm này.

## Kiểm tra sau khi nhập

1. Danh mục CÀ PHÊ BỘT HẠT đếm đủ **20 món**.
2. Bấm "Cà phê Toda 1 (sỉ từ 10kg - đ/kg)", số lượng 10 → tổng ra đúng **1.900.000đ**.
3. Bấm một món bột hạt bất kỳ → POS **bắt buộc** hỏi Hạt hay Bột.
4. Bấm "Cà phê đá" → **"Loại hạt" phải là nhóm đầu tiên** hiện ra.
5. 🔴 Bấm "Cà phê đá" rồi **không chạm gì thêm** → tổng phải là **15.000đ**. Nếu ra **19.000đ** thì đã lỡ bật bắt buộc cho Loại hạt — tắt ngay.
6. In thử một phiếu → tên món dài không bị cắt mất chữ.
