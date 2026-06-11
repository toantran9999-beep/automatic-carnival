import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "restai-images";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteFromR2(key: string) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }),
  );
}

export function getPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

export function hasR2Config(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);
}

function localBaseDir(): string {
  return process.env.LOCAL_UPLOAD_DIR || path.join("apps", "web", "public", "uploads");
}

/**
 * Lưu file ảnh: dùng R2 nếu đã cấu hình, ngược lại lưu CỤC BỘ (volume uploads)
 * và phục vụ qua PUBLIC_UPLOAD_URL (Caddy /uploads). Trả về URL công khai.
 */
export async function storeUpload(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  if (hasR2Config()) {
    await uploadToR2(key, body, contentType);
    return getPublicUrl(key);
  }
  const abs = path.join(localBaseDir(), key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  const publicBase = process.env.PUBLIC_UPLOAD_URL || "/uploads";
  return `${publicBase}/${key}`;
}

export async function deleteUpload(key: string): Promise<void> {
  if (hasR2Config()) {
    await deleteFromR2(key);
    return;
  }
  try {
    await unlink(path.join(localBaseDir(), key));
  } catch {
    // file không tồn tại — bỏ qua
  }
}
