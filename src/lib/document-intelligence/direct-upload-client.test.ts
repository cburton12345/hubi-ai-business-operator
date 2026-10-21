import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadToSignedUrl = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl }),
    },
  }),
}));

import {
  DirectUploadCanceledError,
  uploadAndProcessExpenseDocuments,
} from "./direct-upload-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("uploadAndProcessExpenseDocuments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    uploadToSignedUrl.mockReset();
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
  });

  it("continues after one invalid service response and finalizes the interrupted file", async () => {
    const batchId = "22222222-2222-4222-8222-222222222222";
    const documentId = "33333333-3333-4333-8333-333333333333";
    const storageEventId = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: batchId, projectId: null }))
      .mockResolvedValueOnce(new Response("Unexpected response", { status: 500, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        prepared: {
          storagePath: "tenant/file-2.jpeg",
          storageEventId,
          fileName: "file-2.jpeg",
          mimeType: "image/jpeg",
          byteCount: 4,
          token: "signed-token",
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        fileName: "file-2.jpeg",
        status: "needs_review",
        documentId,
        reusedExisting: false,
        statementCoverage: null,
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        summary: {
          id: batchId,
          label: "2 document upload",
          status: "partial",
          expectedFileCount: 2,
          importedFileCount: 1,
          reusedFileCount: 0,
          failedFileCount: 1,
          unresolvedFileCount: 0,
        },
      }));
    const files = [
      new File(["one"], "file-1.jpeg", { type: "image/jpeg" }),
      new File(["two"], "file-2.jpeg", { type: "image/jpeg" }),
    ];

    const result = await uploadAndProcessExpenseDocuments({
      files,
      sourceProduct: "ferocity",
    });

    expect(result.results).toEqual([
      expect.objectContaining({ ok: false, fileName: "file-1.jpeg" }),
      expect.objectContaining({ ok: true, fileName: "file-2.jpeg", documentId }),
    ]);
    expect(result.batch.status).toBe("partial");
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    const finalizeRequest = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body));
    expect(finalizeRequest).toEqual({
      operation: "finalize_batch",
      input: {
        batchId,
        unresolvedFailures: [expect.objectContaining({ fileIndex: 0, fileName: "file-1.jpeg" })],
      },
    });
  });

  it("stops before uploading files when the newly created batch is canceled", async () => {
    const batchId = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: batchId, projectId: null }));
    const controller = new AbortController();

    await expect(uploadAndProcessExpenseDocuments({
      files: [new File(["one"], "file-1.jpeg", { type: "image/jpeg" })],
      sourceProduct: "ferocity",
      signal: controller.signal,
      onBatchCreated: () => controller.abort(),
    })).rejects.toBeInstanceOf(DirectUploadCanceledError);

    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
});
