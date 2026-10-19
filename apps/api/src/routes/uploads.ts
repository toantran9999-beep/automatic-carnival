import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { storeUpload, deleteUpload, normalizeImage } from "../lib/r2.js";
import { t } from "../lib/i18n.js";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_UPLOAD_TYPES = new Set(["menu", "logo", "category"]);

const uploads = new Hono<AppEnv>();
uploads.use("*", authMiddleware, tenantMiddleware);
// Chỉ vai trò được quản lý menu/thương hiệu mới upload/xóa ảnh (thu ngân/phục vụ không).
uploads.use("*", requirePermission("menu:update"));

// POST / — Upload single image
uploads.post("/", async (c) => {
  const tenant = c.get("tenant") as any;
  const formData = await c.req.formData();

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return c.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: t(c, "file_required") },
      },
      400,
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return c.json(
      {
        success: false,
        error: {
          code: "BAD_REQUEST",
          message: t(c, "file_type_not_allowed"),
        },
      },
      400,
    );
  }

  if (file.size > MAX_SIZE) {
    return c.json(
      {
        success: false,
        error: {
          code: "BAD_REQUEST",
          message: t(c, "file_size_exceeded"),
        },
      },
      400,
    );
  }

  const uploadType = (formData.get("type") as string) || "menu";
  if (!ALLOWED_UPLOAD_TYPES.has(uploadType)) {
    return c.json(
      {
        success: false,
        error: {
          code: "BAD_REQUEST",
          message: t(c, "invalid_upload_type"),
        },
      },
      400,
    );
  }

  // Chuẩn hoá TRƯỚC khi đặt tên: ảnh ra WebP thì đuôi file phải là .webp, kẻo
  // máy chủ tệp gửi sai Content-Type. Xem `normalizeImage`.
  const normalized = await normalizeImage(new Uint8Array(await file.arrayBuffer()), file.type);
  const uuid = crypto.randomUUID();
  const key = `${tenant.organizationId}/${uploadType}/${uuid}.${normalized.ext}`;

  const url = await storeUpload(key, normalized.bytes, normalized.contentType);
  return c.json({ success: true, data: { url, key } });
});

// DELETE /* — Delete image (key nằm sau /api/uploads/)
uploads.delete("/*", async (c) => {
  const tenant = c.get("tenant") as any;
  const key = c.req.param("*") || "";

  if (!key) {
    return c.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: t(c, "file_key_required") },
      },
      400,
    );
  }

  // Chống path traversal: cấm "..", ký tự "\\", đường dẫn tuyệt đối.
  const normalized = key.replace(/\\/g, "/");
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: t(c, "file_key_required") } },
      400,
    );
  }

  // Chỉ được xóa ảnh trong thư mục của chính tổ chức mình.
  const prefix = `${tenant.organizationId}/`;
  if (!normalized.startsWith(prefix)) {
    return c.json(
      { success: false, error: { code: "FORBIDDEN", message: t(c, "no_permission") } },
      403,
    );
  }

  await deleteUpload(normalized);
  return c.json({ success: true, data: { deleted: normalized } });
});

export { uploads };
