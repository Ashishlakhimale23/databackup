import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// ---- config ----
const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.AWS_S3_BUCKET || "";

// Falls back to the default AWS credential chain (IAM role, shared
// config, etc.) if explicit keys aren't provided in the environment -
// handy for prod where the API runs on an instance/role with S3 access.
export const s3Client = new S3Client({
  region: REGION,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

// ---- upload rules: xlsx / pdf / image, under 20MB ----
export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/**
 * Some browsers send an empty or generic mimeType for spreadsheets, so we
 * accept the file if EITHER the declared mime type OR the extension is on
 * the allow-list, rather than requiring both.
 */
export function isAllowedAttachment(fileName: string, mimeType: string) {
  const ext = "." + (fileName.split(".").pop() || "").toLowerCase();
  return ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType) || ALLOWED_EXTENSIONS.has(ext);
}

function sanitizeFileName(fileName: string) {
  // Strip anything that isn't safe in a URL path segment; keep it short.
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

/** Namespaced by company + ticket so objects are easy to reason about / lock down via bucket policy. */
export function buildAttachmentKey(companyId: string, ticketId: string, fileName: string) {
  return `attachments/${companyId}/${ticketId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function getPublicFileUrl(key: string) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export function isOwnedByOurBucket(fileUrl: string) {
  return BUCKET.length > 0 && fileUrl.startsWith(`https://${BUCKET}.s3.${REGION}.amazonaws.com/`);
}

/**
 * Generates a short-lived presigned PUT URL so the browser can upload the
 * file bytes directly to S3 - the file never passes through this API.
 * ContentLength is pinned to the size the client declared, so S3 itself
 * rejects the upload if the actual bytes sent don't match (defense in
 * depth against the 20MB cap being bypassed).
 */
export async function createPresignedUploadUrl(key: string, contentType: string, contentLength: number) {
  if (!BUCKET) {
    throw new Error("AWS_S3_BUCKET is not configured on the server");
  }
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes
  return { uploadUrl, fileUrl: getPublicFileUrl(key) };
}
