import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishStorageUpload, reserveStorageUpload } from "@/lib/usage/storage-quota";

export const receiptBucket = "receipt-expense-assets";
export const maxReceiptUploadBytes = 15 * 1024 * 1024;

export type ReceiptUploadResult = {
  storageUri: string | null;
  signedUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadStatus: "none" | "unsupported_type" | "too_large" | "quota_exceeded" | "storage_not_configured" | "upload_failed" | "uploaded";
  uploadError?: string;
};

export function safeFileName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "receipt";
}

export function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value &&
      typeof value.name === "string" &&
      typeof value.size === "number" &&
      value.size > 0
  );
}

export async function uploadReceiptPhoto(tenantId: string, file: File | null): Promise<ReceiptUploadResult> {
  if (!file) {
    return { storageUri: null, signedUrl: null, fileName: null, mimeType: null, uploadStatus: "none" };
  }

  const mimeType = file.type || "application/octet-stream";
  if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "unsupported_type" };
  }

  if (file.size > maxReceiptUploadBytes) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "too_large" };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "storage_not_configured" };
  }

  const extension = safeFileName(file.name).split(".").pop();
  const storagePath = `${tenantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const storageEventId = await reserveStorageUpload({
    tenantId,
    bucket: receiptBucket,
    storageKey: storagePath,
    sourceType: "expense_receipt",
    byteCount: file.size,
    idempotencyKey: `receipt:${storagePath}`,
    metadata: { fileName: file.name, mimeType }
  });
  if (!storageEventId) {
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "quota_exceeded" };
  }

  const upload = await supabase.storage.from(receiptBucket).upload(storagePath, await file.arrayBuffer(), {
    contentType: mimeType,
    upsert: false
  });

  if (upload.error) {
    await finishStorageUpload(storageEventId, "failed", { providerError: upload.error.message });
    return { storageUri: null, signedUrl: null, fileName: file.name, mimeType, uploadStatus: "upload_failed", uploadError: upload.error.message };
  }
  await finishStorageUpload(storageEventId, "active");

  const signed = mimeType.startsWith("image/")
    ? await supabase.storage.from(receiptBucket).createSignedUrl(storagePath, 60 * 15)
    : null;

  return {
    storageUri: `supabase://${receiptBucket}/${storagePath}`,
    signedUrl: signed?.data?.signedUrl ?? null,
    fileName: file.name,
    mimeType,
    uploadStatus: "uploaded"
  };
}
