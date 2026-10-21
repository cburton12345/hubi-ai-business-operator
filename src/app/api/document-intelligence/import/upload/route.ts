import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { directUploadControlRequestSchema } from "@/lib/document-intelligence/direct-upload-protocol";
import {
  cancelExpenseDocumentImportBatch,
  createExpenseDocumentImportBatch,
  finalizeExpenseDocumentImportBatch,
  prepareExpenseDocumentUpload,
  processPreparedExpenseDocument,
} from "@/lib/document-intelligence/direct-upload-service";

const noStoreHeaders = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const actor = await requirePermission("lead:manage");
  const parsed = directUploadControlRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return json({ ok: false, error: "The secure upload request is invalid." }, 400);
  }
  const uploadActor = {
    workspaceId: actor.workspace.id,
    userId: actor.userId === "admin-token" ? null : actor.userId,
  };

  try {
    switch (parsed.data.operation) {
      case "create_batch": {
        const batch = await createExpenseDocumentImportBatch(uploadActor, parsed.data.input);
        return json({ ok: true, ...batch });
      }
      case "prepare_file": {
        const prepared = await prepareExpenseDocumentUpload(uploadActor, parsed.data.input);
        return json({ ok: true, prepared });
      }
      case "process_file": {
        const result = await processPreparedExpenseDocument(uploadActor, parsed.data.input);
        revalidatePath("/app/expenses");
        revalidatePath("/app/job-tracker");
        return json(result, result.ok ? 200 : 422);
      }
      case "finalize_batch": {
        const finalized = await finalizeExpenseDocumentImportBatch(uploadActor, parsed.data.input);
        revalidatePath("/app/expenses");
        return json({ ok: true, ...finalized });
      }
      case "cancel_batch": {
        const canceled = await cancelExpenseDocumentImportBatch(uploadActor, parsed.data.input);
        revalidatePath("/app/expenses");
        return json({ ok: true, batch: canceled });
      }
    }
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "The secure upload request failed.",
    }, 500);
  }
}
