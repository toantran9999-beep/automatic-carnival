import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { storeUpload, deleteUpload } from "../lib/r2.js";
import { t } from "../lib/i18n.js";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_UPLOAD_TYPES = new Set(["menu", "logo", "category"]);

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

const uploads = new Hono<AppEnv>();
uploads.use("*", authMiddleware, tenantMiddleware);

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

  const ext = extFromMime(file.type);
  const uuid = crypto.randomUUID();
  const key = `${tenant.organizationId}/${uploadType}/${uuid}.${ext}`;

  const buffer = new Uint8Array(await file.arrayBuffer());
  const url = await storeUpload(key, buffer, file.type);
  return c.json({ success: true, data: { url, key } });
});

// DELETE /:key — Delete image
uploads.delete("/*", async (c) => {
  const key = c.req.path.slice(1); // remove leading /
  if (!key) {
    return c.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: t(c, "file_key_required") },
      },
      400,
    );
  }

  await deleteUpload(key);
  return c.json({ success: true, data: { deleted: key } });
});

export { uploads };
