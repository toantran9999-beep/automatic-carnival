import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile, unlink, readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "restai-images";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const THUMB_WIDTH = 320;

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

export async function existsInR2(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function readFromR2(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return bytes;
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

/** Ghi 1 file vào R2 hoặc đĩa cục bộ (tuỳ cấu hình), trả về URL công khai. */
export async function writeLocalOrR2(
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

/** Suy key thumbnail từ key gốc: abc.jpg -> abc.thumb.jpg (giữ nguyên đuôi). */
export function toThumbKey(key: string): string {
  const dot = key.lastIndexOf(".");
  const slash = key.lastIndexOf("/");
  if (dot <= slash) return key;
  return `${key.slice(0, dot)}.thumb${key.slice(dot)}`;
}

export function isThumbKey(key: string): boolean {
  return /\.thumb\.[a-z0-9]+$/i.test(key);
}

/** Sinh bản thu nhỏ ~320px, giữ định dạng gốc. Trả về null nếu lỗi (không được làm fail upload gốc). */
export async function generateThumbnail(
  body: Uint8Array,
  contentType: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const image = sharp(body).resize({ width: THUMB_WIDTH, withoutEnlargement: true });
    if (contentType === "image/png") {
      return { bytes: await image.png().toBuffer(), contentType: "image/png" };
    }
    if (contentType === "image/webp") {
      return { bytes: await image.webp().toBuffer(), contentType: "image/webp" };
    }
    if (contentType === "image/gif") {
      return { bytes: await image.png().toBuffer(), contentType: "image/png" };
    }
    return { bytes: await image.jpeg({ quality: 78 }).toBuffer(), contentType: "image/jpeg" };
  } catch (err) {
    console.error("[r2] Sinh thumbnail thất bại:", err);
    return null;
  }
}

/**
 * Lưu file ảnh: dùng R2 nếu đã cấu hình, ngược lại lưu CỤC BỘ (volume uploads)
 * và phục vụ qua PUBLIC_UPLOAD_URL (Caddy /uploads). Trả về URL công khai.
 * Đồng thời sinh + lưu thêm bản thumbnail ~320px (best-effort, lỗi không fail upload gốc).
 */
export async function storeUpload(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  const url = await writeLocalOrR2(key, body, contentType);

  try {
    const thumb = await generateThumbnail(body, contentType);
    if (thumb) {
      await writeLocalOrR2(toThumbKey(key), thumb.bytes, thumb.contentType);
    }
  } catch (err) {
    console.error("[r2] Lưu thumbnail thất bại:", err);
  }

  return url;
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

/** Liệt kê toàn bộ key ảnh đã lưu (R2 hoặc đĩa cục bộ), dùng cho script backfill. */
export async function listAllKeys(): Promise<string[]> {
  if (hasR2Config()) {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }

  const base = localBaseDir();
  const keys: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        keys.push(path.relative(base, abs).split(path.sep).join("/"));
      }
    }
  }
  await walk(base);
  return keys;
}

export async function existsUpload(key: string): Promise<boolean> {
  if (hasR2Config()) {
    return existsInR2(key);
  }
  try {
    await stat(path.join(localBaseDir(), key));
    return true;
  } catch {
    return false;
  }
}

export async function readUpload(key: string): Promise<Uint8Array> {
  if (hasR2Config()) {
    return readFromR2(key);
  }
  return readFile(path.join(localBaseDir(), key));
}
