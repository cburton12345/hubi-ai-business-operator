import { NextResponse } from "next/server";
import { processExpenseDocumentBatch } from "@/lib/document-intelligence/workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configuredSecret = process.env.DOCUMENT_INGEST_SECRET;
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const sourceMessageRef = String(formData.get("messageId") ?? "");
  const suppliedText = String(formData.get("bodyText") ?? "");
  const files = formData.getAll("attachment").filter((value): value is File => value instanceof File && value.size > 0);
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId) || !files.length) {
    return NextResponse.json({ error: "workspaceId and one or more attachments are required" }, { status: 400 });
  }
  try {
    const result = await processExpenseDocumentBatch({
      workspaceId,
      files,
      sourceChannel: "email",
      sourceMessageRef: sourceMessageRef || null,
      suppliedText: suppliedText || null
    });
    return NextResponse.json({
      ok: result.failed.length === 0,
      documents: result.completed.map((item) => ({ documentId: item.documentId, status: item.status, duplicate: item.duplicate })),
      failures: result.failed
    }, { status: result.completed.length ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document import failed" }, { status: 422 });
  }
}
