"use client";

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-4">
      <h2 className="text-xl font-semibold">Đã xảy ra lỗi</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || "Đã xảy ra lỗi không mong muốn"}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
      >
        Thử lại
      </button>
    </div>
  );
}
