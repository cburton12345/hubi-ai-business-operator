import crypto from "node:crypto";
import { safeFileName } from "@/lib/operations-workforce/receipt-upload";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishStorageUpload, reserveStorageUpload } from "@/lib/usage/storage-quota";

export const fieldMediaBucket = "field-work-assets";
export const maxFieldMediaUploadBytes = 25 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf"
]);

export type FieldMediaUploadResult = {
  storageUri: string | null;
  signedUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadStatus:
    | "none"
    | "unsupported_type"
    | "too_large"
    | "quota_exceeded"
    | "storage_not_configured"
    | "upload_failed"
    | "uploaded";
  uploadError?: string;
};

export function validateFieldMediaFile(file: File | null) {
  if (!file) return "none" as const;
  if (!allowedMimeTypes.has(file.type || "application/octet-stream")) return "unsupported_type" as const;
  if (file.size > maxFieldMediaUploadBytes) return "too_large" as const;
  return "ready" as const;
}

export async function uploadFieldMediaFile(input: {
  tenantId: string;
  assignmentId?: string | null;
  file: File | null;
}): Promise<FieldMediaUploadResult> {
  const { file } = input;
  const validation = validateFieldMediaFile(file);
  if (!file || validation === "none") {
    return { storageUri: null, signedUrl: null, fileName: null, mimeType: null, uploadStatus: "none" };
  }
  const mimeType = file.type || "application/octet-stream";
  if (validation === "unsupported_type" || validation === "too_large") {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: validation };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "storage_not_configured" };
  }

  const cleanName = safeFileName(file.name);
  const extension = cleanName.includes(".") ? cleanName.split(".").pop() : null;
  const storagePath =
    `${input.tenantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}` +
    (extension ? `.${extension}` : "");
  const storageEventId = await reserveStorageUpload({
    tenantId: input.tenantId,
    bucket: fieldMediaBucket,
    storageKey: storagePath,
    sourceType: "field_work_media",
    sourceId: input.assignmentId,
    byteCount: file.size,
    idempotencyKey: `field-media:${storagePath}`,
    metadata: { fileName: file.name, mimeType }
  });
  if (!storageEventId) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "quota_exceeded" };
  }

  const upload = await supabase.storage.from(fieldMediaBucket).upload(storagePath, await file.arrayBuffer(), {
    contentType: mimeType,
    upsert: false
  });
  if (upload.error) {
    await finishStorageUpload(storageEventId, "failed", { providerError: upload.error.message });
    return {
      storageUri: null,
      signedUrl: null,
      fileName: file.name,
      mimeType,
      uploadStatus: "upload_failed",
      uploadError: upload.error.message
    };
  }
  await finishStorageUpload(storageEventId, "active");

  const signed = mimeType.startsWith("image/")
    ? await supabase.storage.from(fieldMediaBucket).createSignedUrl(storagePath, 60 * 15)
    : null;

  return {
    storageUri: `supabase://${fieldMediaBucket}/${storagePath}`,
    signedUrl: signed?.data?.signedUrl ?? null,
    fileName: file.name,
    mimeType,
    uploadStatus: "uploaded"
  };
}
