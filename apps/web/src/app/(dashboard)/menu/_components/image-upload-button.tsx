"use client";

import { useRef } from "react";
import { Sparkles, Upload } from "lucide-react";
import { useGenerateMenuImage } from "@/hooks/use-ai-images";
import { useUploadImage } from "@/hooks/use-uploads";
import { toast } from "sonner";

export function ImageUploadButton({
  currentUrl,
  onUploaded,
  productName,
  description,
  categoryName,
  onGeneratedPrompt,
  uploadType = "menu",
}: {
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  productName?: string;
  description?: string;
  categoryName?: string;
  onGeneratedPrompt?: (prompt: string) => void;
  uploadType?: "menu" | "category";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadImage = useUploadImage();
  const generateMenuImage = useGenerateMenuImage();
  const canGenerateAiImage = uploadType === "menu" && !!productName?.trim();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadImage.mutateAsync({ file, type: uploadType });
      onUploaded(result.url);
      toast.success("Da tai anh len");
    } catch (err: any) {
      toast.error(err.message || "Khong tai duoc anh");
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const handleGenerateAiImage = async () => {
    if (!canGenerateAiImage) {
      toast.error("Nhap ten mon truoc khi tao anh AI");
      return;
    }

    try {
      const result = await generateMenuImage.mutateAsync({
        name: productName!.trim(),
        description: description?.trim() || undefined,
        categoryName: categoryName?.trim() || undefined,
      });
      onUploaded(result.url);
      onGeneratedPrompt?.(result.prompt);
      toast.success("Da tao anh AI cho mon");
    } catch (err: any) {
      toast.error(err.message || "Khong tao duoc anh AI");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {currentUrl && (
        <img
          src={currentUrl}
          alt=""
          className="h-20 w-20 rounded-lg object-cover"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => fileRef.current?.click()}
          disabled={uploadImage.isPending || generateMenuImage.isPending}
        >
          <Upload className="h-3 w-3" />
          {uploadImage.isPending
            ? "Dang tai..."
            : currentUrl
              ? "Doi anh"
              : "Tai anh"}
        </button>
        {uploadType === "menu" && (
          <button
            type="button"
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 disabled:text-muted-foreground"
            onClick={handleGenerateAiImage}
            disabled={
              !canGenerateAiImage ||
              uploadImage.isPending ||
              generateMenuImage.isPending
            }
            title="Tao anh AI tu ten mon"
          >
            <Sparkles className="h-3 w-3" />
            {generateMenuImage.isPending ? "Dang tao..." : "AI"}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
