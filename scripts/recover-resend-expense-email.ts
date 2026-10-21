import pg from "pg";
import { processExpenseDocumentBatch } from "../src/lib/document-intelligence/workflow";

type ReceivedAttachment = {
  filename?: string;
  content_type?: string;
  download_url?: string;
  size?: number;
};

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

async function resendJson(path: string) {
  const apiKey = required(process.env.EMAIL_API_KEY, "EMAIL_API_KEY");
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Resend request failed (${response.status}).`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function main() {
  const tenantId = required(process.argv[2], "tenant id");
  const receivedEmailId = required(process.argv[3], "received email id");
  const projectName = required(process.argv[4], "project name").slice(0, 160);
  const requestedBatchId = process.argv[5]?.trim() || null;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[0-9a-f-]{36}$/i.test(receivedEmailId)) {
    throw new Error("Tenant and received email IDs must be UUIDs.");
  }
  if (requestedBatchId && !/^[0-9a-f-]{36}$/i.test(requestedBatchId)) throw new Error("Recovery batch ID must be a UUID.");

  const databaseUrl = required(process.env.DATABASE_URL, "DATABASE_URL");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const tenant = await client.query<{ id: string }>(
    "select id from public.tenants where id=$1",
    [tenantId],
  );
  if (!tenant.rows[0]) throw new Error("The target workspace does not exist.");

  const received = await resendJson(`/emails/receiving/${encodeURIComponent(receivedEmailId)}`);
  const attachmentsPayload = await resendJson(`/emails/receiving/${encodeURIComponent(receivedEmailId)}/attachments`);
  const attachments = (Array.isArray(attachmentsPayload.data) ? attachmentsPayload.data : [])
    .filter((value): value is ReceivedAttachment => Boolean(value && typeof value === "object"))
    .slice(0, 25);
  const files: File[] = [];
  for (const attachment of attachments) {
    const mimeType = String(attachment.content_type ?? "").trim().toLowerCase();
    const name = String(attachment.filename ?? "").trim() || `emailed-document-${files.length + 1}`;
    if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") continue;
    if (!attachment.download_url || Number(attachment.size ?? 0) > 15 * 1024 * 1024) continue;
    const url = new URL(attachment.download_url);
    const trustedResendHost = url.hostname === "resend.com"
      || url.hostname.endsWith(".resend.com")
      || url.hostname === "resend.app"
      || url.hostname.endsWith(".resend.app");
    if (url.protocol !== "https:" || !trustedResendHost) continue;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not download ${name} (${response.status}).`);
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) continue;
    files.push(new File([bytes], name, { type: mimeType }));
  }
  if (!files.length) throw new Error("The received email has no supported attachments to recover.");

  const project = await client.query<{ id: string }>(`
    insert into public.document_intelligence_projects
      (tenant_id,name,project_type,tax_year,created_by_user_id)
    values ($1,$2,'tax_year',2025,null)
    on conflict (tenant_id,name) do update set updated_at=now()
    returning id`, [tenantId, projectName]);
  const projectId = project.rows[0]?.id;
  if (!projectId) throw new Error("The recovery project could not be created.");
  let batchId: string | undefined;
  if (requestedBatchId) {
    const reusable = await client.query<{ id: string }>(`
      select id from public.document_intelligence_import_batches
      where tenant_id=$1 and id=$2 and project_id=$3 and expected_file_count=$4
        and imported_file_count=0 and reused_file_count=0`, [tenantId, requestedBatchId, projectId, files.length]);
    batchId = reusable.rows[0]?.id;
    if (!batchId) throw new Error("The requested recovery batch cannot be safely reused.");
    await client.query(`
      update public.document_intelligence_import_batches
      set status='processing',failed_file_count=0,completed_at=null,updated_at=now()
      where tenant_id=$1 and id=$2`, [tenantId, batchId]);
  } else {
    const batch = await client.query<{ id: string }>(`
      insert into public.document_intelligence_import_batches
        (tenant_id,project_id,label,source_channel,status,expected_file_count)
      values ($1,$2,$3,'email','processing',$4)
      returning id`, [tenantId, projectId, `${projectName} email intake`, files.length]);
    batchId = batch.rows[0]?.id;
  }
  if (!batchId) throw new Error("The recovery batch could not be created.");

  const ingestSecret = process.env.DOCUMENT_INGEST_SECRET?.trim() || null;
  const ingestBaseUrl = (process.env.DOCUMENT_INGEST_BASE_URL?.trim() || "https://ferocity.live").replace(/\/$/, "");
  const completed: Array<{ fileName: string; documentId: string; status: string; reusedExisting: boolean }> = [];
  const failures: Array<{ fileName: string; error: string }> = [];
  const bodyText = [String(received.subject ?? ""), String(received.text ?? "")].filter(Boolean).join("\n\n");
  for (const [fileIndex, file] of files.entries()) {
    const formData = new FormData();
    formData.set("workspaceId", tenantId);
    formData.set("messageId", receivedEmailId);
    formData.set("bodyText", bodyText);
    formData.set("attachment", file);
    let documentId: string | null = null;
    let outcome: "imported" | "reused" | "failed" = "failed";
    let errorMessage: string | null = null;
    try {
      if (ingestSecret) {
        const response = await fetch(`${ingestBaseUrl}/api/document-intelligence/import/email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ingestSecret}` },
          body: formData,
        });
        const payload = await response.json().catch(() => null) as {
          documents?: Array<{ fileName: string; documentId: string; status: string; reusedExisting: boolean }>;
          failures?: Array<{ fileName: string; error: string }>;
          error?: string;
        } | null;
        const imported = payload?.documents?.[0];
        if (!response.ok || !imported) {
          errorMessage = payload?.failures?.[0]?.error ?? payload?.error ?? `Ingestion failed (${response.status}).`;
          failures.push({ fileName: file.name, error: errorMessage });
        } else {
          documentId = imported.documentId;
          outcome = imported.reusedExisting ? "reused" : "imported";
          completed.push(imported);
        }
      } else {
        const direct = await processExpenseDocumentBatch({
          workspaceId: tenantId,
          files: [file],
          sourceChannel: "email",
          sourceMessageRef: receivedEmailId,
          suppliedText: bodyText || null,
        });
        const imported = direct.completed[0];
        if (!imported) {
          errorMessage = direct.failed[0]?.error ?? "Direct ingestion failed.";
          failures.push({ fileName: file.name, error: errorMessage });
        } else {
          documentId = imported.result.documentId;
          outcome = imported.result.reusedExisting ? "reused" : "imported";
          completed.push({
            fileName: imported.fileName,
            documentId: imported.result.documentId,
            status: imported.result.status,
            reusedExisting: imported.result.reusedExisting,
          });
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Ingestion request failed.";
      failures.push({ fileName: file.name, error: errorMessage });
    }
    await client.query(`
      insert into public.document_intelligence_import_batch_items
        (tenant_id,batch_id,file_index,file_name,mime_type,byte_count,document_id,outcome,error_message)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (batch_id,file_index) do update set
        document_id=excluded.document_id,outcome=excluded.outcome,error_message=excluded.error_message,updated_at=now()`, [
      tenantId, batchId, fileIndex, file.name, file.type, file.size, documentId, outcome, errorMessage,
    ]);
  }
  const importedCount = completed.filter((item) => !item.reusedExisting).length;
  const reusedCount = completed.filter((item) => item.reusedExisting).length;
  const failedCount = failures.length;
  const status = failedCount === files.length ? "failed" : failedCount ? "partial" : "completed";
  await client.query(`
    update public.document_intelligence_import_batches set
      imported_file_count=$3,reused_file_count=$4,failed_file_count=$5,status=$6,
      completed_at=now(),updated_at=now()
    where tenant_id=$1 and id=$2`, [tenantId, batchId, importedCount, reusedCount, failedCount, status]);
  await client.end();
  console.log(JSON.stringify({
    receivedEmailId,
    attachmentCount: files.length,
    projectId,
    batch: { id: batchId, status, importedFileCount: importedCount, reusedFileCount: reusedCount, failedFileCount: failedCount },
    documents: completed,
    failures,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
