"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { Switch } from "@restai/ui/components/switch";
import { cn } from "@/lib/utils";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import {
  usePrintSampleReceipt,
  usePrintSampleKitchen,
  usePrintSampleTransfer,
  type ReceiptConfig,
} from "@/components/print-ticket";
import { Printer, Settings2, ReceiptText, ChefHat, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/stores/lang-store";

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-10">
      {/* min-w-0 để chữ co trước; nút gạt shrink-0 không bao giờ bị đẩy ra ngoài. */}
      <span className="min-w-0 text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={() => onChange()} />
    </div>
  );
}

type SeparatorStyle = "dashed" | "solid" | "double" | "stars" | "none";
type FontSize = "small" | "medium" | "large";
type Section = "general" | "receipt" | "kitchen" | "transfer";

const DEFAULT_FORM = {
  // Chung
  topFeedLines: 4,
  bottomFeedLines: 1,
  paper: "80" as "58" | "80",
  fontSize: "medium" as FontSize,
  utf8Bitmap: false,
  separator: "dashed" as SeparatorStyle,
  // Hóa đơn
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
  kitchenShowTitle: true,
  kitchenShowStaff: true,
  kitchenShowTime: true,
  kitchenShowOrderNumber: true,
  // Phiếu tạm tính
  transferTitle: "PHIẾU TẠM TÍNH",
  transferNote: "Mã quá hạn vui lòng xin phiếu mới.",
  transferShowAddress: true,
  transferShowCustomer: true,
  transferShowBank: true,
  transferShowExpiry: true,
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
  const [section, setSection] = useState<Section>("receipt");

  const set = (patch: Partial<typeof DEFAULT_FORM>) => setForm((f) => ({ ...f, ...patch }));

  const formToConfig = (): ReceiptConfig => ({
    topFeedLines: form.topFeedLines,
    bottomFeedLines: form.bottomFeedLines,
    fontSize: form.fontSize,
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
      show: {
        title: form.kitchenShowTitle,
        staff: form.kitchenShowStaff,
        time: form.kitchenShowTime,
        orderNumber: form.kitchenShowOrderNumber,
      },
    },
    transfer: {
      title: form.transferTitle.trim() || "PHIẾU TẠM TÍNH",
      note: form.transferNote.trim(),
      show: {
        address: form.transferShowAddress,
        customer: form.transferShowCustomer,
        bankInfo: form.transferShowBank,
        expiry: form.transferShowExpiry,
      },
    },
  });

  const handleTestPrint = async (kind: "receipt" | "kitchen" | "transfer") => {
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
        bottomFeedLines: Math.min(5, Math.max(0, Number(raw.bottom_feed_lines ?? 1))),
        paper: raw.paper === "58" ? "58" : "80",
        fontSize: raw.font_size === "small" || raw.font_size === "large" ? raw.font_size : "medium",
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
        kitchenShowTitle: kShow.title ?? true,
        kitchenShowStaff: kShow.staff ?? true,
        kitchenShowTime: kShow.time ?? true,
        kitchenShowOrderNumber: kShow.order_number ?? true,
        transferTitle: typeof tc.title === "string" && tc.title.trim() ? tc.title : DEFAULT_FORM.transferTitle,
        transferNote: typeof tc.note === "string" ? tc.note : DEFAULT_FORM.transferNote,
        transferShowAddress: tShow.address ?? true,
        transferShowCustomer: tShow.customer ?? true,
        transferShowBank: tShow.bank_info ?? true,
        transferShowExpiry: tShow.expiry ?? true,
      });
    }
  }, [branchData]);

  const handleSave = async () => {
    try {
      await updateBranch.mutateAsync({
        receipt: {
          top_feed_lines: form.topFeedLines,
          bottom_feed_lines: form.bottomFeedLines,
          paper: form.paper,
          font_size: form.fontSize,
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
            show: {
              title: form.kitchenShowTitle,
              staff: form.kitchenShowStaff,
              time: form.kitchenShowTime,
              order_number: form.kitchenShowOrderNumber,
            },
          },
          transfer: {
            title: form.transferTitle.trim() || "PHIẾU TẠM TÍNH",
            note: form.transferNote.trim(),
            show: {
              address: form.transferShowAddress,
              customer: form.transferShowCustomer,
              bank_info: form.transferShowBank,
              expiry: form.transferShowExpiry,
            },
          },
        },
      });
      toast.success(t("settings.receiptSaved", "Đã lưu mẫu hóa đơn"));
    } catch (err: any) {
      toast.error(err.message || t("settings.branchError", "Lỗi lưu cài đặt"));
    }
  };

  const sections: Array<{ key: Section; label: string; icon: any }> = [
    { key: "general", label: t("settings.receiptSecGeneral", "Chung"), icon: Settings2 },
    { key: "receipt", label: t("settings.receiptSecReceipt", "Hóa đơn"), icon: ReceiptText },
    { key: "kitchen", label: t("settings.receiptSecKitchen", "Phiếu đặt món"), icon: ChefHat },
    { key: "transfer", label: t("settings.receiptSecTransfer", "Phiếu tạm tính"), icon: QrCode },
  ];

  const previewSep =
    form.separator !== "none" ? <div className={cn("my-1", SEP_PREVIEW[form.separator])} /> : <div className="my-0.5" />;

  const previewFontPx = form.fontSize === "small" ? 10 : form.fontSize === "large" ? 13 : 11.5;

  const receiptPreview = (
    <div
      className="rounded-lg border bg-white text-black p-3 font-mono leading-relaxed shadow-sm"
      style={{ fontSize: `${previewFontPx}px` }}
    >
      <div style={{ height: `${form.topFeedLines * 6}px` }} className="border-b border-dotted border-gray-200" />
      <div className="text-center font-bold" style={{ fontSize: `${previewFontPx + 2}px` }}>
        {branchData?.name || "TODA CAFE"}
      </div>
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
      <div style={{ height: `${form.bottomFeedLines * 6}px` }} className="border-t border-dotted border-gray-200" />
    </div>
  );

  const kitchenPreview = (
    <div
      className="rounded-lg border bg-white text-black p-3 font-mono leading-relaxed shadow-sm"
      style={{ fontSize: `${previewFontPx}px` }}
    >
      {form.kitchenShowTitle && (
        <div className="text-center font-bold" style={{ fontSize: `${previewFontPx + 2}px` }}>
          {form.kitchenTitle.trim() || "PHIẾU ĐẶT ĐỒ"}
        </div>
      )}
      <div className="text-center font-bold">BÀN 5 - Khu B</div>
      {previewSep}
      {form.kitchenShowTime && <div className="flex justify-between"><span>Giờ: 10:30</span><span>Ngày: 05/07</span></div>}
      {form.kitchenShowStaff && <div>Nhân viên: Toàn</div>}
      {form.kitchenShowOrderNumber && <div>Số thứ tự: #A-042</div>}
      {previewSep}
      <div className="font-bold">1 x Cà phê đá (Ly)</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;- Ít ngọt</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;- Thêm thạch cà phê</div>
      <div className="font-bold">2 x Cà phê sữa (Ly)</div>
      <div className="italic">&nbsp;&nbsp;* Ít đường</div>
      {previewSep}
      {form.kitchenFooterText.split("\n").filter(Boolean).map((l, i) => (
        <div key={`kf${i}`} className="text-center">{l}</div>
      ))}
    </div>
  );

  const transferPreview = (
    <div
      className="rounded-lg border bg-white text-black p-3 font-mono leading-relaxed shadow-sm"
      style={{ fontSize: `${previewFontPx}px` }}
    >
      <div className="text-center font-bold" style={{ fontSize: `${previewFontPx + 2}px` }}>
        {branchData?.name || "TODA CAFE"}
      </div>
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
      {form.transferShowExpiry && <div>Hiệu lực đến: 10:45</div>}
      {form.transferNote.trim() && <div className="text-center">{form.transferNote.trim()}</div>}
    </div>
  );

  const activePreview =
    section === "kitchen" ? kitchenPreview : section === "transfer" ? transferPreview : receiptPreview;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 max-w-2xl">
        <div className="h-10 rounded bg-muted" />
        <div className="h-10 rounded bg-muted" />
        <div className="h-10 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chọn mục */}
      <div className="flex flex-wrap gap-2">
        {sections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 h-10 text-sm font-medium transition-colors",
              section === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-4 pt-6">
            {section === "general" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("settings.receiptGeneralDesc", "Áp dụng chung cho cả 3 loại phiếu: hóa đơn, phiếu đặt món, phiếu tạm tính.")}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("settings.receiptPaper", "Khổ giấy")}</Label>
                    <Select value={form.paper} onValueChange={(v) => set({ paper: v as "58" | "80" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="80">80mm</SelectItem>
                        <SelectItem value="58">58mm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.receiptFontSize", "Cỡ chữ")}</Label>
                    <Select value={form.fontSize} onValueChange={(v) => set({ fontSize: v as FontSize })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">{t("settings.receiptFontSmall", "Nhỏ")}</SelectItem>
                        <SelectItem value="medium">{t("settings.receiptFontMedium", "Vừa")}</SelectItem>
                        <SelectItem value="large">{t("settings.receiptFontLarge", "Lớn")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.receiptTopFeed", "Khoảng trắng đầu phiếu (dòng)")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={form.topFeedLines}
                      onChange={(e) => set({ topFeedLines: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("settings.receiptTopFeedHelp", "Để to nếu cần kẹp phiếu vào thanh/gai hóa đơn.")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.receiptBottomFeed", "Khoảng trắng cuối phiếu (dòng)")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      value={form.bottomFeedLines}
                      onChange={(e) => set({ bottomFeedLines: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("settings.receiptBottomFeedHelp", "0 = cắt sát nhất máy in cho phép.")}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.receiptSeparator", "Kiểu đường kẻ phân cách")}</Label>
                  <Select value={form.separator} onValueChange={(v) => set({ separator: v as SeparatorStyle })}>
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
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{t("settings.receiptUtf8", "In tiếng Việt có dấu")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.receiptUtf8Help", "In phiếu dạng ảnh (UTF-8 có dấu đầy đủ). Chậm hơn một chút so với in chữ thường bỏ dấu.")}
                    </p>
                  </div>
                  <Switch
                    checked={form.utf8Bitmap}
                    onCheckedChange={(v) => set({ utf8Bitmap: v })}
                  />
                </div>
              </>
            )}

            {section === "receipt" && (
              <>
                <div className="space-y-2">
                  <Label>{t("settings.receiptHeader", "Dòng chữ đầu phiếu (dưới tên quán, mỗi dòng 1 hàng)")}</Label>
                  <textarea
                    className="w-full min-h-[70px] rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                    placeholder={t("settings.receiptHeaderPh", "VD: Chi nhánh Quận 1\nHotline: 0909 999 999")}
                    value={form.headerText}
                    onChange={(e) => set({ headerText: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.receiptFooter", "Dòng chữ cuối phiếu (mỗi dòng 1 hàng)")}</Label>
                  <textarea
                    className="w-full min-h-[70px] rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                    placeholder={t("settings.receiptFooterPh", "VD: Cảm ơn quý khách!\nWifi: TODA - Pass: 12345678")}
                    value={form.footerText}
                    onChange={(e) => set({ footerText: e.target.value })}
                  />
                </div>
                <div className="space-y-1 rounded-lg border p-4">
                  <p className="text-sm font-medium mb-1">{t("settings.receiptShowTitle", "Ẩn/hiện từng mục")}</p>
                  <ToggleRow label={t("settings.receiptShowAddress", "Địa chỉ quán")} checked={form.showAddress} onChange={() => set({ showAddress: !form.showAddress })} />
                  <ToggleRow label={t("settings.receiptShowPhone", "Số điện thoại quán")} checked={form.showPhone} onChange={() => set({ showPhone: !form.showPhone })} />
                  <ToggleRow label={t("settings.receiptShowCustomer", "Tên khách hàng")} checked={form.showCustomer} onChange={() => set({ showCustomer: !form.showCustomer })} />
                  <ToggleRow label={t("settings.receiptShowPayment", "Phương thức thanh toán")} checked={form.showPaymentMethod} onChange={() => set({ showPaymentMethod: !form.showPaymentMethod })} />
                  <ToggleRow label={t("settings.receiptShowVat", "Dòng thuế VAT")} checked={form.showVat} onChange={() => set({ showVat: !form.showVat })} />
                </div>
              </>
            )}

            {section === "kitchen" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("settings.kitchenDesc", "Phiếu in ra mỗi lần gửi món cho quầy pha chế.")}
                </p>
                <div className="space-y-2">
                  <Label>{t("settings.kitchenTitleLabel", "Tiêu đề phiếu")}</Label>
                  <Input
                    value={form.kitchenTitle}
                    placeholder="PHIẾU ĐẶT ĐỒ"
                    onChange={(e) => set({ kitchenTitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.kitchenFooterLabel", "Dòng chữ cuối phiếu (mỗi dòng 1 hàng)")}</Label>
                  <textarea
                    className="w-full min-h-[50px] rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                    placeholder="Toda Cafe"
                    value={form.kitchenFooterText}
                    onChange={(e) => set({ kitchenFooterText: e.target.value })}
                  />
                </div>
                <div className="space-y-1 rounded-lg border p-4">
                  <p className="text-sm font-medium mb-1">{t("settings.receiptShowTitle", "Ẩn/hiện từng mục")}</p>
                  <ToggleRow label={t("settings.kitchenShowTitleRow", "Dòng tiêu đề (PHIẾU ĐẶT ĐỒ)")} checked={form.kitchenShowTitle} onChange={() => set({ kitchenShowTitle: !form.kitchenShowTitle })} />
                  <ToggleRow label={t("settings.kitchenShowTime", "Dòng Giờ / Ngày")} checked={form.kitchenShowTime} onChange={() => set({ kitchenShowTime: !form.kitchenShowTime })} />
                  <ToggleRow label={t("settings.kitchenShowStaff", "Tên nhân viên")} checked={form.kitchenShowStaff} onChange={() => set({ kitchenShowStaff: !form.kitchenShowStaff })} />
                  <ToggleRow label={t("settings.kitchenShowOrderNo", "Số thứ tự đơn")} checked={form.kitchenShowOrderNumber} onChange={() => set({ kitchenShowOrderNumber: !form.kitchenShowOrderNumber })} />
                </div>
              </>
            )}

            {section === "transfer" && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("settings.transferDesc", "Phiếu đưa khách quét QR chuyển khoản trước khi chốt thanh toán.")}
                </p>
                <div className="space-y-2">
                  <Label>{t("settings.transferTitleLabel", "Tiêu đề phiếu")}</Label>
                  <Input
                    value={form.transferTitle}
                    placeholder="PHIẾU TẠM TÍNH"
                    onChange={(e) => set({ transferTitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.transferNoteLabel", "Ghi chú cuối phiếu")}</Label>
                  <Input
                    value={form.transferNote}
                    placeholder="Mã quá hạn vui lòng xin phiếu mới."
                    onChange={(e) => set({ transferNote: e.target.value })}
                  />
                </div>
                <div className="space-y-1 rounded-lg border p-4">
                  <p className="text-sm font-medium mb-1">{t("settings.receiptShowTitle", "Ẩn/hiện từng mục")}</p>
                  <ToggleRow label={t("settings.transferShowAddress", "Địa chỉ quán")} checked={form.transferShowAddress} onChange={() => set({ transferShowAddress: !form.transferShowAddress })} />
                  <ToggleRow label={t("settings.transferShowCustomer", "Tên khách hàng")} checked={form.transferShowCustomer} onChange={() => set({ transferShowCustomer: !form.transferShowCustomer })} />
                  <ToggleRow label={t("settings.transferShowBank", "Thông tin ngân hàng (dưới QR)")} checked={form.transferShowBank} onChange={() => set({ transferShowBank: !form.transferShowBank })} />
                  <ToggleRow label={t("settings.transferShowExpiry", "Dòng hiệu lực của mã")} checked={form.transferShowExpiry} onChange={() => set({ transferShowExpiry: !form.transferShowExpiry })} />
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button onClick={handleSave} disabled={updateBranch.isPending} className="h-11">
                {updateBranch.isPending ? t("settings.saving", "Đang lưu...") : t("settings.saveChanges", "Lưu thay đổi")}
              </Button>
              {section !== "general" ? (
                <Button variant="outline" className="h-11" onClick={() => handleTestPrint(section)}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("settings.receiptTestPrint", "In thử")}{" "}
                  {sections.find((s) => s.key === section)?.label.toLowerCase()}
                </Button>
              ) : (
                <Button variant="outline" className="h-11" onClick={() => handleTestPrint("receipt")}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("settings.receiptTestPrint", "In thử")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.receiptTestHelp", "\"In thử\" dùng cấu hình đang chỉnh trên form (kể cả chưa lưu). Lưu xong, máy POS phải thoát app mở lại mới nhận cấu hình mới.")}
            </p>
          </CardContent>
        </Card>

        {/* Xem trước theo mục đang chỉnh */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            {t("settings.receiptPreview", "Xem trước")}
            {section === "kitchen"
              ? ` — ${t("settings.receiptSecKitchen", "Phiếu đặt món")}`
              : section === "transfer"
                ? ` — ${t("settings.receiptSecTransfer", "Phiếu tạm tính")}`
                : ` — ${t("settings.receiptSecReceipt", "Hóa đơn")}`}
          </p>
          {activePreview}
          {!form.utf8Bitmap && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {t("settings.receiptAsciiNote", "Đang in chữ thường: máy in nhiệt sẽ tự bỏ dấu tiếng Việt. Bật \"In tiếng Việt có dấu\" trong mục Chung nếu muốn giữ dấu.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
