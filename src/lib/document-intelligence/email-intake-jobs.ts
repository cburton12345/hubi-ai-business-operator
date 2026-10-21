import { queryPostgres } from "@/lib/db/postgres";
import {
  createDocumentImportBatch,
  recordDocumentImportBatchItem,
  recordMissingDocumentImportBatchFailures,
} from "@/lib/document-intelligence/document-batches";
import { processExpenseDocumentBatch } from "@/lib/document-intelligence/workflow";

const maxAttempts = 3;

export type ResendExpenseAttachment = {
  id: string;
  fileIndex: number;
  fileName: string;
  mimeType: string;
  byteCount: number;
};

export type RejectedResendExpenseAttachment = {
  fileIndex: number;
  fileName: string;
  mimeType: string | null;
  byteCount: number | null;
  error: string;
};

type EmailJob = {
  id: string;
  tenant_id: string;
  batch_id: string;
  provider_message_id: string;
  provider_attachment_id: string;
  file_index: number;
  file_name: string;
  mime_type: string;
  byte_count: string;
  supplied_text: string | null;
  attempts: number;
};

function trustedResendUrl(value: string) {
  const url = new URL(value);
  const trustedHost = url.hostname === "resend.com"
    || url.hostname.endsWith(".resend.com")
    || url.hostname === "resend.app"
    || url.hostname.endsWith(".resend.app");
  if (url.protocol !== "https:" || !trustedHost) throw new Error("Resend returned an untrusted attachment URL.");
  return url;
}

export async function enqueueResendExpenseEmail(input: {
  tenantId: string;
  providerMessageId: string;
  subject: string;
  body: string;
  attachments: ResendExpenseAttachment[];
  rejectedAttachments?: RejectedResendExpenseAttachment[];
}) {
  const rejectedAttachments = input.rejectedAttachments ?? [];
  const expectedFileCount = input.attachments.length + rejectedAttachments.length;
  if (expectedFileCount < 1 || expectedFileCount > 25) throw new Error("Email intake requires between 1 and 25 attachments.");
  const positions = [...input.attachments, ...rejectedAttachments].map((attachment) => attachment.fileIndex);
  if (new Set(positions).size !== positions.length || positions.some((position) => !Number.isInteger(position) || position < 0 || position >= expectedFileCount)) {
    throw new Error("Email attachment positions must be unique and contiguous within the intake batch.");
  }
  const existing = await queryPostgres<{ batch_id: string; project_id: string | null; job_ids: string[] }>(`
    select j.batch_id,b.project_id,array_agg(j.id order by j.file_index) as job_ids
    from public.document_intelligence_email_jobs j
    join public.document_intelligence_import_batches b on b.tenant_id=j.tenant_id and b.id=j.batch_id
    where j.tenant_id=$1 and j.provider_message_id=$2
    group by j.batch_id,b.project_id
    order by min(j.created_at)
    limit 1`, [input.tenantId, input.providerMessageId]);
  if (existing?.rows[0]) {
    return {
      id: existing.rows[0].batch_id,
      projectId: existing.rows[0].project_id,
      jobIds: existing.rows[0].job_ids,
    };
  }
  const projectName = `Email - ${input.subject.trim().slice(0, 148) || "documents"}`;
  const batch = await createDocumentImportBatch({
    tenantId: input.tenantId,
    expectedFileCount,
    label: `${input.subject.trim().slice(0, 142) || "Email documents"} (${expectedFileCount})`,
    newProjectName: projectName,
    taxYear: /\b(20\d{2})\b/.test(input.subject) ? Number(input.subject.match(/\b(20\d{2})\b/)?.[1]) : null,
    sourceChannel: "email",
  });
  await queryPostgres(`
    update public.document_intelligence_import_batches
    set metadata_json=metadata_json || $3::jsonb,updated_at=now()
    where tenant_id=$1 and id=$2`, [input.tenantId, batch.id, JSON.stringify({
    provider: "resend",
    providerMessageId: input.providerMessageId,
    subject: input.subject,
    supportedAttachmentCount: input.attachments.length,
    rejectedAttachmentCount: rejectedAttachments.length,
  })]);
  const jobIds: string[] = [];
  for (const attachment of input.attachments) {
    const inserted = await queryPostgres<{ id: string }>(`
      insert into public.document_intelligence_email_jobs (
        tenant_id,batch_id,provider_message_id,provider_attachment_id,file_index,
        file_name,mime_type,byte_count,supplied_text
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (tenant_id,provider_message_id,provider_attachment_id)
      do update set updated_at=now()
      returning id`, [
      input.tenantId, batch.id, input.providerMessageId, attachment.id, attachment.fileIndex,
      attachment.fileName, attachment.mimeType, attachment.byteCount,
      [input.subject, input.body].filter(Boolean).join("\n\n").slice(0, 10000),
    ]);
    const id = inserted?.rows[0]?.id;
    if (!id) throw new Error(`Could not queue ${attachment.fileName}.`);
    jobIds.push(id);
  }
  if (rejectedAttachments.length) {
    await recordMissingDocumentImportBatchFailures({
      tenantId: input.tenantId,
      batchId: batch.id,
      failures: rejectedAttachments,
    });
  }
  return { ...batch, jobIds };
}

export async function listDueResendExpenseEmailJobIds(limit = 50) {
  const bounded = Math.max(1, Math.min(Math.trunc(limit), 100));
  const result = await queryPostgres<{ id: string }>(`
    select id from public.document_intelligence_email_jobs
    where attempts<$2 and (
      (status='pending' and next_attempt_at<=now())
      or (status='processing' and locked_at<now()-interval '12 minutes')
    )
    order by next_attempt_at,created_at
    limit $1`, [bounded, maxAttempts]);
  return (result?.rows ?? []).map((row) => row.id);
}

export async function processResendExpenseEmailJob(jobId: string, emailApiKey: string) {
  const claimed = await queryPostgres<EmailJob>(`
    update public.document_intelligence_email_jobs set
      status='processing',attempts=attempts+1,locked_at=now(),updated_at=now(),last_error=null
    where id=$1 and attempts<$2 and (
      (status='pending' and next_attempt_at<=now())
      or (status='processing' and locked_at<now()-interval '12 minutes')
    ) returning *`, [jobId, maxAttempts]);
  const job = claimed?.rows[0];
  if (!job) return { skipped: true as const };
  try {
    const listResponse = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(job.provider_message_id)}/attachments`, {
      headers: { Authorization: `Bearer ${emailApiKey}` },
      cache: "no-store",
    });
    if (!listResponse.ok) throw new Error(`Resend attachment listing failed (${listResponse.status}).`);
    const payload = await listResponse.json().catch(() => null) as { data?: Array<Record<string, unknown>> } | null;
    const attachment = payload?.data?.find((item) => String(item.id ?? "") === job.provider_attachment_id);
    const downloadUrl = String(attachment?.download_url ?? "");
    if (!downloadUrl) throw new Error("The queued Resend attachment is no longer available.");
    const download = await fetch(trustedResendUrl(downloadUrl), { cache: "no-store" });
    if (!download.ok) throw new Error(`Resend attachment download failed (${download.status}).`);
    const bytes = await download.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error("The queued attachment is empty or larger than 15 MB.");
    const file = new File([bytes], job.file_name, { type: job.mime_type });
    const processed = await processExpenseDocumentBatch({
      workspaceId: job.tenant_id,
      files: [file],
      sourceChannel: "email",
      sourceMessageRef: job.provider_message_id,
      suppliedText: job.supplied_text,
      maxFiles: 1,
    });
    const success = processed.completed[0];
    const failure = processed.failed[0];
    if (!success) throw new Error(failure?.error ?? "Document processing failed.");
    const stillActive = await queryPostgres<{ status: string }>(
      `select status from public.document_intelligence_email_jobs where id=$1 limit 1`,
      [job.id]
    );
    if (stillActive?.rows[0]?.status === "canceled") {
      return { skipped: true as const, canceled: true as const };
    }
    await recordDocumentImportBatchItem({
      tenantId: job.tenant_id,
      batchId: job.batch_id,
      fileIndex: job.file_index,
      fileName: success.fileName,
      mimeType: job.mime_type,
      byteCount: Number(job.byte_count),
      documentId: success.result.documentId,
      outcome: success.result.reusedExisting ? "reused" : "imported",
    });
    await queryPostgres(`
      update public.document_intelligence_email_jobs set
        status='completed',completed_at=now(),locked_at=null,last_error=null,updated_at=now()
      where id=$1 and status='processing'`, [job.id]);
    return { skipped: false as const, ok: true as const, documentId: success.result.documentId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email attachment processing failed.";
    const exhausted = job.attempts >= maxAttempts;
    await queryPostgres(`
      update public.document_intelligence_email_jobs set
        status=$2,next_attempt_at=now()+make_interval(mins=>$3),locked_at=null,last_error=$4,updated_at=now()
      where id=$1 and status<>'canceled'`, [job.id, exhausted ? "failed" : "pending", Math.min(15, 2 ** job.attempts), message.slice(0, 1000)]);
    if (exhausted) {
      await recordDocumentImportBatchItem({
        tenantId: job.tenant_id,
        batchId: job.batch_id,
        fileIndex: job.file_index,
        fileName: job.file_name,
        mimeType: job.mime_type,
        byteCount: Number(job.byte_count),
        outcome: "failed",
        errorMessage: message,
      });
    }
    throw error;
  }
}
