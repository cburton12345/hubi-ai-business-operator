import { z } from "zod";

export const directUploadMetadataSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().max(200),
  size: z.number().int().positive().max(15 * 1024 * 1024),
});

export const directUploadReferenceSchema = z.object({
  storagePath: z.string().min(1).max(1000),
  storageEventId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  byteCount: z.number().int().positive().max(15 * 1024 * 1024),
});

export const directUploadProcessSchema = z.object({
  reference: directUploadReferenceSchema,
  sourceProduct: z.enum(["ferocity", "expense_intelligence"]).default("expense_intelligence"),
  sourceMessageRef: z.string().uuid().nullable().optional(),
  suppliedText: z.string().max(2000).nullable().optional(),
  batchId: z.string().uuid(),
  fileIndex: z.number().int().min(0).max(49),
});

export const directUploadCreateBatchSchema = z.object({
  expectedFileCount: z.number().int().min(1).max(50),
  label: z.string().trim().max(160).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  newProjectName: z.string().trim().max(160).nullable().optional(),
  taxYear: z.number().int().min(2000).max(2200).nullable().optional(),
});

export const directUploadFailedItemSchema = z.object({
  fileIndex: z.number().int().min(0).max(49),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200).nullable().optional(),
  byteCount: z.number().int().positive().max(15 * 1024 * 1024).nullable().optional(),
  error: z.string().trim().min(1).max(1000),
});

export const directUploadFinalizeSchema = z.object({
  batchId: z.string().uuid(),
  unresolvedFailures: z.array(directUploadFailedItemSchema).max(50).default([]),
});

export const directUploadCancelSchema = z.object({
  batchId: z.string().uuid(),
});

export const directUploadControlRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create_batch"), input: directUploadCreateBatchSchema }),
  z.object({ operation: z.literal("prepare_file"), input: directUploadMetadataSchema }),
  z.object({ operation: z.literal("process_file"), input: directUploadProcessSchema }),
  z.object({ operation: z.literal("finalize_batch"), input: directUploadFinalizeSchema }),
  z.object({ operation: z.literal("cancel_batch"), input: directUploadCancelSchema }),
]);

export type DirectUploadCreateBatchInput = z.infer<typeof directUploadCreateBatchSchema>;
export type DirectUploadProcessInput = z.infer<typeof directUploadProcessSchema>;
export type DirectUploadFinalizeInput = z.infer<typeof directUploadFinalizeSchema>;
export type DirectUploadFailedItem = z.infer<typeof directUploadFailedItemSchema>;
