"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { cn } from "@/lib/utils";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import { usePrintSampleReceipt, type ReceiptConfig } from "@/components/print-ticket";
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
  });

  const handleTestPrint = async () => {
    try {
      const via = await printSample(formToConfig());
      toast.success(
        via === "escpos"
          ? t("settings.receiptTestSent", "Đã gửi phiếu in thử tới máy in")
          : t("settings.receiptTestBrowser", "Không có máy in ESC/POS — in thử qua trình duyệt"),
      );
    } catch (err: any) {
      toast.error(err.message || t("settings.receiptTestError", "Lỗi in thử"));
    }
  };

  useEffect(() => {
    const raw = branchData?.settings?.receipt;
    if (raw) {
      const show = raw.show || {};
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

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={updateBranch.isPending}>
                  {updateBranch.isPending ? t("settings.saving", "Đang lưu...") : t("settings.saveChanges", "Lưu thay đổi")}
                </Button>
                <Button variant="outline" onClick={handleTestPrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("settings.receiptTestPrint", "In thử")}
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
      </div>
    </div>
  );
}
