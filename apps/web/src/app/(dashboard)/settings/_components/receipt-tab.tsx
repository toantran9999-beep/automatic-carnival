"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { cn } from "@/lib/utils";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import {
  usePrintSampleReceipt,
  usePrintSampleKitchen,
  usePrintSampleTransfer,
  type ReceiptConfig,
} from "@/components/print-ticket";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

type SeparatorStyle = "dashed" | "solid" | "double" | "stars" | "none";

const DEFAULT_FORM = {
  topFeedLines: 4,
  paper: "80" as "58" | "80",
  utf8Bitmap: false,
  separator: "dashed" as SeparatorStyle,
  headerText: "",
  footerText: "Cảm ơn quý khách và Hẹn gặp lại!",
  showAddress: true,
  showPhone: false,
  showCustomer: true,
  showPaymentMethod: true,
  showVat: true,
  // Phiếu đặt món
  kitchenTitle: "PHIẾU ĐẶT ĐỒ",
  kitchenFooterText: "Toda Cafe",
  kitchenShowStaff: true,
  kitchenShowTime: true,
  // Phiếu tạm tính
  transferTitle: "PHIẾU TẠM TÍNH",
  transferNote: "Mã quá hạn vui lòng xin phiếu mới.",
  transferShowAddress: true,
  transferShowCustomer: true,
  transferShowBank: true,
};

const SEP_PREVIEW: Record<SeparatorStyle, string> = {
  dashed: "border-t border-dashed border-foreground",
  solid: "border-t border-solid border-foreground",
  double: "border-t-4 border-double border-foreground",
  stars: "border-t border-dotted border-foreground",
  none: "",
};

export function ReceiptTab() {
  const { data: branchData, isLoading } = useBranchSettings();
  const updateBranch = useUpdateBranch();
  const printSample = usePrintSampleReceipt();
  const printSampleKitchen = usePrintSampleKitchen();
  const printSampleTransfer = usePrintSampleTransfer();
  const { t } = useTranslation();

  const [form, setForm] = useState(DEFAULT_FORM);

  const formToConfig = (): ReceiptConfig => ({
    topFeedLines: form.topFeedLines,
    paper: form.paper,
    utf8Bitmap: form.utf8Bitmap,
    separator: form.separator,
    headerLines: form.headerText.split("\n").map((l) => l.trim()).filter(Boolean),
    footerLines: form.footerText.split("\n").map((l) => l.trim()).filter(Boolean),
    show: {
      address: form.showAddress,
      phone: form.showPhone,
      customer: form.showCustomer,
      paymentMethod: form.showPaymentMethod,
      vat: form.showVat,
    },
    kitchen: {
      title: form.kitchenTitle.trim() || "PHIẾU ĐẶT ĐỒ",
      footerLines: form.kitchenFooterText.split("\n").map((l) => l.trim()).filter(Boolean),
      show: { staff: form.kitchenShowStaff, time: form.kitchenShowTime },
    },
    transfer: {
      title: form.transferTitle.trim() || "PHIẾU TẠM TÍNH",
      note: form.transferNote.trim(),
      show: {
        address: form.transferShowAddress,
        customer: form.transferShowCustomer,
        bankInfo: form.transferShowBank,
      },
    },
  });

  const handleTestPrint = async (kind: "receipt" | "kitchen" | "transfer" = "receipt") => {
    try {
      const printer =
        kind === "kitchen" ? printSampleKitchen : kind === "transfer" ? printSampleTransfer : printSample;
      const via = await printer(formToConfig());
      if (via === "escpos-bitmap") {
        toast.success(t("settings.receiptTestBitmap", "Đã in thử: chế độ ẢNH có dấu tiếng Việt"));
      } else if (via === "escpos-text") {
        toast.success(
          form.utf8Bitmap
            ? t("settings.receiptTestTextFallback", "⚠ Đã in thử nhưng KHÔNG tạo được ảnh — máy rơi về chữ thường bỏ dấu")
            : t("settings.receiptTestText", "Đã in thử: chế độ chữ thường (bỏ dấu)"),
        );
      } else {
        toast.success(t("settings.receiptTestBrowser", "Không có máy in ESC/POS — in thử qua trình duyệt"));
      }
    } catch (err: any) {
      toast.error(err.message || t("settings.receiptTestError", "Lỗi in thử"));
    }
  };

  useEffect(() => {
    const raw = branchData?.settings?.receipt;
    if (raw) {
      const show = raw.show || {};
      const kc = raw.kitchen || {};
      const kShow = kc.show || {};
      const tc = raw.transfer || {};
      const tShow = tc.show || {};
      setForm({
        topFeedLines: Math.min(10, Math.max(0, Number(raw.top_feed_lines ?? 4))),
        paper: raw.paper === "58" ? "58" : "80",
        utf8Bitmap: !!raw.utf8_bitmap,
        separator: (["dashed", "solid", "double", "stars", "none"].includes(raw.separator)
          ? raw.separator
          : "dashed") as SeparatorStyle,
        headerText: Array.isArray(raw.header_lines) ? raw.header_lines.join("\n") : "",
        footerText: Array.isArray(raw.footer_lines)
          ? raw.footer_lines.join("\n")
          : DEFAULT_FORM.footerText,
        showAddress: show.address ?? true,
        showPhone: show.phone ?? false,
        showCustomer: show.customer ?? true,
        showPaymentMethod: show.payment_method ?? true,
        showVat: show.vat ?? true,
        kitchenTitle: typeof kc.title === "string" && kc.title.trim() ? kc.title : DEFAULT_FORM.kitchenTitle,
        kitchenFooterText: Array.isArray(kc.footer_lines)
          ? kc.footer_lines.join("\n")
          : DEFAULT_FORM.kitchenFooterText,
        kitchenShowStaff: kShow.staff ?? true,
        kitchenShowTime: kShow.time ?? true,
        transferTitle: typeof tc.title === "string" && tc.title.trim() ? tc.title : DEFAULT_FORM.transferTitle,
        transferNote: typeof tc.note === "string" ? tc.note : DEFAULT_FORM.transferNote,
        transferShowAddress: tShow.address ?? true,
        transferShowCustomer: tShow.customer ?? true,
        transferShowBank: tShow.bank_info ?? true,
      });
    }
  }, [branchData]);

  const handleSave = async () => {
    try {
      await updateBranch.mutateAsync({
        receipt: {
          top_feed_lines: form.topFeedLines,
          paper: form.paper,
          utf8_bitmap: form.utf8Bitmap,
          separator: form.separator,
          header_lines: form.headerText.split("\n").map((l) => l.trim()).filter(Boolean),
          footer_lines: form.footerText.split("\n").map((l) => l.trim()).filter(Boolean),
          show: {
            address: form.showAddress,
            phone: form.showPhone,
            customer: form.showCustomer,
            payment_method: form.showPaymentMethod,
            vat: form.showVat,
          },
          kitchen: {
            title: form.kitchenTitle.trim() || "PHIẾU ĐẶT ĐỒ",
            footer_lines: form.kitchenFooterText.split("\n").map((l) => l.trim()).filter(Boolean),
            show: { staff: form.kitchenShowStaff, time: form.kitchenShowTime },
          },
          transfer: {
            title: form.transferTitle.trim() || "PHIẾU TẠM TÍNH",
            note: form.transferNote.trim(),
            show: {
              address: form.transferShowAddress,
              customer: form.transferShowCustomer,
              bank_info: form.transferShowBank,
            },
          },
        },
      });
      toast.success(t("settings.receiptSaved", "Đã lưu mẫu hóa đơn"));
    } catch (err: any) {
      toast.error(err.message || t("settings.branchError", "Lỗi lưu cài đặt"));
    }
  };

  const showToggles: Array<{ key: keyof typeof form; label: string }> = [
    { key: "showAddress", label: t("settings.receiptShowAddress", "Địa chỉ quán") },
    { key: "showPhone", label: t("settings.receiptShowPhone", "Số điện thoại quán") },
    { key: "showCustomer", label: t("settings.receiptShowCustomer", "Tên khách hàng") },
    { key: "showPaymentMethod", label: t("settings.receiptShowPayment", "Phương thức thanh toán") },
    { key: "showVat", label: t("settings.receiptShowVat", "Dòng thuế VAT") },
  ];

  const previewSep = form.separator !== "none" ? <div className={cn("my-1", SEP_PREVIEW[form.separator])} /> : <div className="my-0.5" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.receiptTitle", "Mẫu hóa đơn")}</CardTitle>
          <CardDescription>
            {t("settings.receiptDesc", "Tùy chỉnh nội dung và bố cục hóa đơn in cho khách tại chi nhánh này.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("settings.receiptTopFeed", "Khoảng trắng đầu phiếu (dòng)")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={form.topFeedLines}
                    onChange={(e) =>
                      setForm({ ...form, topFeedLines: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.receiptTopFeedHelp", "Để to nếu cần kẹp phiếu vào thanh/gai hóa đơn.")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.receiptPaper", "Khổ giấy")}</Label>
                  <Select value={form.paper} onValueChange={(v) => setForm({ ...form, paper: v as "58" | "80" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80">80mm</SelectItem>
                      <SelectItem value="58">58mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("settings.receiptSeparator", "Kiểu đường kẻ phân cách")}</Label>
                <Select
                  value={form.separator}
                  onValueChange={(v) => setForm({ ...form, separator: v as SeparatorStyle })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashed">{t("settings.receiptSepDashed", "Nét đứt (----)")}</SelectItem>
                    <SelectItem value="solid">{t("settings.receiptSepSolid", "Nét liền (____)")}</SelectItem>
                    <SelectItem value="double">{t("settings.receiptSepDouble", "Nét đôi (====)")}</SelectItem>
                    <SelectItem value="stars">{t("settings.receiptSepStars", "Chấm sao (****)")}</SelectItem>
                    <SelectItem value="none">{t("settings.receiptSepNone", "Không kẻ")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("settings.receiptHeader", "Dòng chữ đầu phiếu (dưới tên quán, mỗi dòng 1 hàng)")}</Label>
                <textarea
                  className="w-full min-h-[70px] rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                  placeholder={t("settings.receiptHeaderPh", "VD: Chi nhánh Quận 1\nHotline: 0909 999 999")}
                  value={form.headerText}
                  onChange={(e) => setForm({ ...form, headerText: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("settings.receiptFooter", "Dòng chữ cuối phiếu (mỗi dòng 1 hàng)")}</Label>
                <textarea
                  className="w-full min-h-[70px] rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                  placeholder={t("settings.receiptFooterPh", "VD: Cảm ơn quý khách!\nWifi: TODA - Pass: 12345678")}
                  value={form.footerText}
                  onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                />
              </div>

              <div className="space-y-2 rounded-lg border p-4">
                <p className="text-sm font-medium mb-2">{t("settings.receiptShowTitle", "Ẩn/hiện từng mục trên hóa đơn")}</p>
                <div className="space-y-3">
                  {showToggles.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <Toggle
                        checked={form[key] as boolean}
                        onChange={() => setForm({ ...form, [key]: !form[key] })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">{t("settings.receiptUtf8", "In tiếng Việt có dấu")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.receiptUtf8Help", "In phiếu dạng ảnh (UTF-8 có dấu đầy đủ). Chậm hơn một chút so với in chữ thường bỏ dấu.")}
                  </p>
                </div>
                <Toggle checked={form.utf8Bitmap} onChange={() => setForm({ ...form, utf8Bitmap: !form.utf8Bitmap })} />
              </div>

              {/* ---- Phiếu đặt món ---- */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t("settings.kitchenTicketTitle", "Phiếu đặt món (in khi gửi món)")}</p>
                  <Button variant="outline" size="sm" onClick={() => handleTestPrint("kitchen")}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    {t("settings.receiptTestPrint", "In thử")}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.kitchenTitleLabel", "Tiêu đề phiếu")}</Label>
                  <Input
                    value={form.kitchenTitle}
                    placeholder="PHIẾU ĐẶT ĐỒ"
                    onChange={(e) => setForm({ ...form, kitchenTitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.kitchenFooterLabel", "Dòng chữ cuối phiếu (mỗi dòng 1 hàng)")}</Label>
                  <textarea
                    className="w-full min-h-[50px] rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                    placeholder="Toda Cafe"
                    value={form.kitchenFooterText}
                    onChange={(e) => setForm({ ...form, kitchenFooterText: e.target.value })}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("settings.kitchenShowTime", "Dòng Giờ / Ngày")}</span>
                    <Toggle checked={form.kitchenShowTime} onChange={() => setForm({ ...form, kitchenShowTime: !form.kitchenShowTime })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("settings.kitchenShowStaff", "Tên nhân viên")}</span>
                    <Toggle checked={form.kitchenShowStaff} onChange={() => setForm({ ...form, kitchenShowStaff: !form.kitchenShowStaff })} />
                  </div>
                </div>
              </div>

              {/* ---- Phiếu tạm tính ---- */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t("settings.transferTicketTitle", "Phiếu tạm tính (kèm QR chuyển khoản)")}</p>
                  <Button variant="outline" size="sm" onClick={() => handleTestPrint("transfer")}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    {t("settings.receiptTestPrint", "In thử")}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.transferTitleLabel", "Tiêu đề phiếu")}</Label>
                  <Input
                    value={form.transferTitle}
                    placeholder="PHIẾU TẠM TÍNH"
                    onChange={(e) => setForm({ ...form, transferTitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.transferNoteLabel", "Ghi chú cuối phiếu")}</Label>
                  <Input
                    value={form.transferNote}
                    placeholder="Mã quá hạn vui lòng xin phiếu mới."
                    onChange={(e) => setForm({ ...form, transferNote: e.target.value })}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("settings.transferShowAddress", "Địa chỉ quán")}</span>
                    <Toggle checked={form.transferShowAddress} onChange={() => setForm({ ...form, transferShowAddress: !form.transferShowAddress })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("settings.transferShowCustomer", "Tên khách hàng")}</span>
                    <Toggle checked={form.transferShowCustomer} onChange={() => setForm({ ...form, transferShowCustomer: !form.transferShowCustomer })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("settings.transferShowBank", "Thông tin ngân hàng (dưới QR)")}</span>
                    <Toggle checked={form.transferShowBank} onChange={() => setForm({ ...form, transferShowBank: !form.transferShowBank })} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.transferSharedNote", "Khổ giấy, khoảng trắng đầu phiếu, kiểu đường kẻ và chế độ in có dấu dùng chung cấu hình phía trên cho cả 3 loại phiếu.")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={updateBranch.isPending}>
                  {updateBranch.isPending ? t("settings.saving", "Đang lưu...") : t("settings.saveChanges", "Lưu thay đổi")}
                </Button>
                <Button variant="outline" onClick={() => handleTestPrint("receipt")}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("settings.receiptTestPrint", "In thử hóa đơn")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.receiptTestHelp", "\"In thử\" dùng cấu hình đang chỉnh trên form (kể cả chưa lưu) — mở tab này trên máy POS có máy in để kiểm tra trực tiếp.")}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Xem trước nhanh */}
      <div className="hidden lg:block">
        <p className="text-xs text-muted-foreground mb-2">{t("settings.receiptPreview", "Xem trước")}</p>
        <div className="rounded-lg border bg-white text-black p-3 font-mono text-[11px] leading-relaxed shadow-sm">
          <div style={{ height: `${form.topFeedLines * 6}px` }} />
          <div className="text-center font-bold text-[13px]">{branchData?.name || "TODA CAFE"}</div>
          {form.headerText.split("\n").filter(Boolean).map((l, i) => (
            <div key={`h${i}`} className="text-center">{l}</div>
          ))}
          {form.showAddress && branchData?.address && <div className="text-center">{branchData.address}</div>}
          {form.showPhone && branchData?.phone && <div className="text-center">ĐT: {branchData.phone}</div>}
          {previewSep}
          <div className="text-center font-bold">HÓA ĐƠN</div>
          <div>Đơn hàng: #A-042</div>
          {form.showCustomer && <div>Khách: Anh Ba</div>}
          {previewSep}
          <div className="flex justify-between"><span>2x Cà phê sữa</span><span>50.000đ</span></div>
          <div className="flex justify-between"><span>1x Bạc xỉu</span><span>29.000đ</span></div>
          {previewSep}
          <div className="flex justify-between"><span>Tạm tính</span><span>79.000đ</span></div>
          {form.showVat && <div className="flex justify-between"><span>Thuế VAT</span><span>0đ</span></div>}
          <div className="flex justify-between font-bold"><span>TỔNG CỘNG</span><span>79.000đ</span></div>
          {form.showPaymentMethod && <div>Thanh toán: Tiền mặt</div>}
          {previewSep}
          {form.footerText.split("\n").filter(Boolean).map((l, i) => (
            <div key={`f${i}`} className="text-center">{l}</div>
          ))}
        </div>
        {!form.utf8Bitmap && (
          <p className="text-[10px] text-muted-foreground mt-2">
            {t("settings.receiptAsciiNote", "Đang in chữ thường: máy in nhiệt sẽ tự bỏ dấu tiếng Việt. Bật \"In tiếng Việt có dấu\" nếu muốn giữ dấu.")}
          </p>
        )}

        {/* Xem trước phiếu đặt món */}
        <p className="text-xs text-muted-foreground mb-2 mt-6">{t("settings.kitchenPreview", "Xem trước phiếu đặt món")}</p>
        <div className="rounded-lg border bg-white text-black p-3 font-mono text-[11px] leading-relaxed shadow-sm">
          <div className="text-center font-bold text-[13px]">{form.kitchenTitle.trim() || "PHIẾU ĐẶT ĐỒ"}</div>
          <div className="text-center font-bold">BÀN 5</div>
          {previewSep}
          {form.kitchenShowTime && <div className="flex justify-between"><span>Giờ: 10:30</span><span>Ngày: 05/07</span></div>}
          {form.kitchenShowStaff && <div>Nhân viên: Toàn</div>}
          <div>Số thứ tự: #A-042</div>
          {previewSep}
          <div className="font-bold">2 x Cà phê sữa (Ly)</div>
          <div className="italic text-[10px]">&nbsp;&nbsp;* Ít đường</div>
          <div className="font-bold">1 x Bạc xỉu (Ly)</div>
          {previewSep}
          {form.kitchenFooterText.split("\n").filter(Boolean).map((l, i) => (
            <div key={`kf${i}`} className="text-center">{l}</div>
          ))}
        </div>

        {/* Xem trước phiếu tạm tính */}
        <p className="text-xs text-muted-foreground mb-2 mt-6">{t("settings.transferPreview", "Xem trước phiếu tạm tính")}</p>
        <div className="rounded-lg border bg-white text-black p-3 font-mono text-[11px] leading-relaxed shadow-sm">
          <div className="text-center font-bold text-[13px]">{branchData?.name || "TODA CAFE"}</div>
          {form.transferShowAddress && branchData?.address && <div className="text-center">{branchData.address}</div>}
          {previewSep}
          <div className="text-center font-bold">{form.transferTitle.trim() || "PHIẾU TẠM TÍNH"}</div>
          <div>Đơn: #A-042 · Bàn: 5</div>
          {form.transferShowCustomer && <div>Khách: Anh Ba</div>}
          {previewSep}
          <div className="flex justify-between"><span>2x Cà phê sữa</span><span>50.000đ</span></div>
          <div className="flex justify-between font-bold"><span>TỔNG CẦN TRẢ</span><span>79.000đ</span></div>
          {previewSep}
          <div className="text-center font-bold">QUÉT QR CHUYỂN KHOẢN</div>
          <div className="mx-auto my-1 h-14 w-14 border border-black grid place-items-center text-[9px]">QR</div>
          {form.transferShowBank && (
            <>
              <div>Người nhận: TODA CAFE</div>
              <div>STK: 0123456789</div>
            </>
          )}
          <div>Nội dung: TODA-A042</div>
          {form.transferNote.trim() && <div className="text-center text-[10px]">{form.transferNote.trim()}</div>}
        </div>
      </div>
    </div>
  );
}
