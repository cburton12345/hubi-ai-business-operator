import { queryPostgres } from "@/lib/db/postgres";

export type DocumentImportBatchSummary = {
  id: string;
  label: string;
  status: "processing" | "completed" | "partial" | "failed" | "canceled";
  expectedFileCount: number;
  importedFileCount: number;
  reusedFileCount: number;
  failedFileCount: number;
  unresolvedFileCount: number;
};

export type DocumentImportBatchItemOutcome = {
  fileIndex: number;
  fileName: string;
  outcome: "imported" | "reused" | "failed";
  documentId: string | null;
  errorMessage: string | null;
};

export async function requireDocumentImportBatchProcessing(tenantId: string, batchId: string) {
  const result = await queryPostgres<{ status: DocumentImportBatchSummary["status"] }>(`
    select status from public.document_intelligence_import_batches
    where tenant_id=$1 and id=$2`, [tenantId, batchId]);
  const status = result?.rows[0]?.status;
  if (!status) throw new Error("The upload batch is unavailable.");
  if (status === "canceled") throw new Error("This upload batch was canceled.");
  if (status !== "processing") throw new Error("This upload batch is no longer accepting files.");
  return status;
}

export function summarizeDocumentImportBatchCounts(input: {
  expected: number;
  imported: number;
  reused: number;
  failed: number;
}) {
  const expected = Math.max(0, Math.trunc(input.expected));
  const imported = Math.max(0, Math.trunc(input.imported));
  const reused = Math.max(0, Math.trunc(input.reused));
  const failed = Math.max(0, Math.trunc(input.failed));
  const unresolved = Math.max(expected - imported - reused - failed, 0);
  const status: DocumentImportBatchSummary["status"] = unresolved > 0
    ? "processing"
    : failed === expected
      ? "failed"
      : failed > 0
        ? "partial"
        : "completed";
  return { expected, imported, reused, failed, unresolved, status };
}

export async function createDocumentImportBatch(input: {
  tenantId: string;
  userId?: string | null;
  expectedFileCount: number;
  label?: string | null;
  projectId?: string | null;
  newProjectName?: string | null;
  taxYear?: number | null;
  sourceChannel?: "camera" | "upload" | "drag_drop" | "email" | "api" | "mobile" | "other";
}) {
  const expected = Math.trunc(input.expectedFileCount);
  if (expected < 1 || expected > 50) throw new Error("Choose between 1 and 50 documents for one upload batch.");
  const requestedProjectName = input.newProjectName?.trim().slice(0, 160) || null;
  let projectId = input.projectId ?? null;
  if (requestedProjectName) {
    const project = await queryPostgres<{ id: string }>(`
      insert into public.document_intelligence_projects
        (tenant_id,name,project_type,tax_year,created_by_user_id)
      values ($1,$2,$3,$4,$5)
      on conflict (tenant_id,name) do update set updated_at=now()
      returning id`, [
        input.tenantId,
        requestedProjectName,
        input.taxYear ? "tax_year" : "general",
        input.taxYear ?? null,
        input.userId ?? null,
      ]);
    projectId = project?.rows[0]?.id ?? null;
  } else if (projectId) {
    const project = await queryPostgres<{ id: string }>(`
      select id from public.document_intelligence_projects
      where tenant_id=$1 and id=$2 and status='active'`, [input.tenantId, projectId]);
    if (!project?.rows[0]) throw new Error("The selected document project is unavailable.");
  }
  const label = input.label?.trim().slice(0, 160) || `${expected} document upload`;
  const result = await queryPostgres<{ id: string }>(`
    insert into public.document_intelligence_import_batches (
      tenant_id,project_id,label,source_channel,status,expected_file_count,created_by_user_id
    ) values ($1,$2,$3,$4,'processing',$5,$6)
    returning id`, [
      input.tenantId, projectId, label, input.sourceChannel ?? "upload", expected, input.userId ?? null,
    ]);
  const id = result?.rows[0]?.id;
  if (!id) throw new Error("Ferocity could not create the upload batch.");
  return { id, projectId };
}

export async function recordDocumentImportBatchItem(input: {
  tenantId: string;
  batchId: string;
  fileIndex: number;
  fileName: string;
  mimeType?: string | null;
  byteCount?: number | null;
  documentId?: string | null;
  outcome: "imported" | "reused" | "failed";
  errorMessage?: string | null;
}) {
  const batch = await queryPostgres<{ id: string; expected_file_count: string; status: DocumentImportBatchSummary["status"] }>(`
    select id,expected_file_count::text,status from public.document_intelligence_import_batches
    where tenant_id=$1 and id=$2 for update`, [input.tenantId, input.batchId]);
  const expected = Number(batch?.rows[0]?.expected_file_count ?? 0);
  if (!expected) throw new Error("The upload batch is unavailable.");
  if (batch?.rows[0]?.status === "canceled") throw new Error("This upload batch was canceled.");
  if (batch?.rows[0]?.status !== "processing") throw new Error("This upload batch is no longer accepting files.");
  if (!Number.isInteger(input.fileIndex) || input.fileIndex < 0 || input.fileIndex >= expected) {
    throw new Error("The upload file position is outside this batch.");
  }
  if (input.outcome !== "failed" && !input.documentId) throw new Error("A successful batch item requires a document.");
  await queryPostgres(`
    insert into public.document_intelligence_import_batch_items (
      tenant_id,batch_id,file_index,file_name,mime_type,byte_count,document_id,outcome,error_message
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (batch_id,file_index) do update set
      file_name=excluded.file_name,mime_type=excluded.mime_type,byte_count=excluded.byte_count,
      document_id=excluded.document_id,outcome=excluded.outcome,error_message=excluded.error_message,
      updated_at=now()`, [
      input.tenantId, input.batchId, input.fileIndex, input.fileName.trim().slice(0, 255),
      input.mimeType ?? null, input.byteCount ?? null, input.documentId ?? null,
      input.outcome, input.errorMessage?.slice(0, 1000) ?? null,
    ]);
  return refreshDocumentImportBatch(input.tenantId, input.batchId);
}

export async function recordMissingDocumentImportBatchFailures(input: {
  tenantId: string;
  batchId: string;
  failures: Array<{
    fileIndex: number;
    fileName: string;
    mimeType?: string | null;
    byteCount?: number | null;
    error: string;
  }>;
}) {
  const batch = await queryPostgres<{ expected_file_count: string; status: DocumentImportBatchSummary["status"] }>(`
    select expected_file_count::text,status
    from public.document_intelligence_import_batches
    where tenant_id=$1 and id=$2`, [input.tenantId, input.batchId]);
  const expected = Number(batch?.rows[0]?.expected_file_count ?? 0);
  if (!expected) throw new Error("The upload batch is unavailable.");
  if (batch?.rows[0]?.status === "canceled") throw new Error("This upload batch was canceled.");
  if (batch?.rows[0]?.status !== "processing") throw new Error("This upload batch is no longer accepting files.");

  const uniqueFailures = new Map<number, (typeof input.failures)[number]>();
  for (const failure of input.failures) {
    if (!Number.isInteger(failure.fileIndex) || failure.fileIndex < 0 || failure.fileIndex >= expected) {
      throw new Error("An upload file position is outside this batch.");
    }
    uniqueFailures.set(failure.fileIndex, failure);
  }
  for (const failure of uniqueFailures.values()) {
    await queryPostgres(`
      insert into public.document_intelligence_import_batch_items (
        tenant_id,batch_id,file_index,file_name,mime_type,byte_count,outcome,error_message
      ) values ($1,$2,$3,$4,$5,$6,'failed',$7)
      on conflict (batch_id,file_index) do nothing`, [
      input.tenantId,
      input.batchId,
      failure.fileIndex,
      failure.fileName.trim().slice(0, 255),
      failure.mimeType ?? null,
      failure.byteCount ?? null,
      failure.error.slice(0, 1000),
    ]);
  }
}

export async function refreshDocumentImportBatch(tenantId: string, batchId: string): Promise<DocumentImportBatchSummary> {
  const result = await queryPostgres<{
    id: string; label: string; status: DocumentImportBatchSummary["status"];
    expected_file_count: string; imported_file_count: string; reused_file_count: string;
    failed_file_count: string; unresolved_file_count: string;
  }>(`
    with counts as (
      select b.id,b.expected_file_count,
        count(i.id) filter (where i.outcome='imported')::int as imported,
        count(i.id) filter (where i.outcome='reused')::int as reused,
        count(i.id) filter (where i.outcome='failed')::int as failed,
        greatest(b.expected_file_count-count(i.id),0)::int as unresolved
      from public.document_intelligence_import_batches b
      left join public.document_intelligence_import_batch_items i
        on i.tenant_id=b.tenant_id and i.batch_id=b.id
      where b.tenant_id=$1 and b.id=$2
      group by b.id,b.expected_file_count
    ), updated as (
      update public.document_intelligence_import_batches b set
        imported_file_count=c.imported,reused_file_count=c.reused,failed_file_count=c.failed,
        status=case
          when c.unresolved>0 then 'processing'
          when c.failed=c.expected_file_count then 'failed'
          when c.failed>0 then 'partial'
          else 'completed'
        end,
        completed_at=case when c.unresolved=0 then coalesce(b.completed_at,now()) else null end,
        updated_at=now()
      from counts c where b.id=c.id and b.status<>'canceled'
      returning b.id
    )
    select b.id,b.label,b.status,b.expected_file_count,b.imported_file_count,
      b.reused_file_count,b.failed_file_count,
      greatest(b.expected_file_count-b.imported_file_count-b.reused_file_count-b.failed_file_count,0)::text as unresolved_file_count
    from public.document_intelligence_import_batches b
    join counts c on c.id=b.id
    where b.tenant_id=$1 and b.id=$2`, [tenantId, batchId]);
  const row = result?.rows[0];
  if (!row) throw new Error("The upload batch is unavailable.");
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    expectedFileCount: Number(row.expected_file_count),
    importedFileCount: Number(row.imported_file_count),
    reusedFileCount: Number(row.reused_file_count),
    failedFileCount: Number(row.failed_file_count),
    unresolvedFileCount: Number(row.unresolved_file_count),
  };
}

export async function listDocumentImportBatchItemOutcomes(
  tenantId: string,
  batchId: string,
): Promise<DocumentImportBatchItemOutcome[]> {
  const result = await queryPostgres<{
    file_index: number;
    file_name: string;
    outcome: DocumentImportBatchItemOutcome["outcome"];
    document_id: string | null;
    error_message: string | null;
  }>(`
    select i.file_index,i.file_name,i.outcome,i.document_id,i.error_message
    from public.document_intelligence_import_batch_items i
    join public.document_intelligence_import_batches b
      on b.tenant_id=i.tenant_id and b.id=i.batch_id
    where i.tenant_id=$1 and i.batch_id=$2
    order by i.file_index`, [tenantId, batchId]);
  return (result?.rows ?? []).map((row) => ({
    fileIndex: Number(row.file_index),
    fileName: row.file_name,
    outcome: row.outcome,
    documentId: row.document_id,
    errorMessage: row.error_message,
  }));
}

export async function assignDocumentImportBatchProject(input: {
  tenantId: string;
  batchId: string;
  projectId: string | null;
}) {
  if (input.projectId) {
    const project = await queryPostgres<{ id: string }>(`
      select id from public.document_intelligence_projects
      where tenant_id=$1 and id=$2 and status='active'`, [input.tenantId, input.projectId]);
    if (!project?.rows[0]) throw new Error("The selected document project is unavailable.");
  }
  const updated = await queryPostgres<{ id: string }>(`
    update public.document_intelligence_import_batches set project_id=$3,updated_at=now()
    where tenant_id=$1 and id=$2 returning id`, [input.tenantId, input.batchId, input.projectId]);
  if (!updated?.rows[0]) throw new Error("The upload batch is unavailable.");
}

export async function cancelDocumentImportBatch(input: { tenantId: string; batchId: string }) {
  const result = await queryPostgres<{ id: string; status: "canceled" }>(`
    with canceled_jobs as (
      update public.document_intelligence_email_jobs
      set status='canceled',locked_at=null,last_error='Canceled by an authorized workspace operator.',updated_at=now()
      where tenant_id=$1 and batch_id=$2 and status in ('pending','processing')
    ), canceled_batch as (
      update public.document_intelligence_import_batches
      set status='canceled',completed_at=coalesce(completed_at,now()),
        metadata_json=metadata_json||jsonb_build_object('canceledAt',now()),updated_at=now()
      where tenant_id=$1 and id=$2 and status='processing'
      returning id,status
    )
    select id,status from canceled_batch
    union all
    select id,status from public.document_intelligence_import_batches
    where tenant_id=$1 and id=$2 and status='canceled'
      and not exists (select 1 from canceled_batch)
    limit 1`, [input.tenantId, input.batchId]);
  if (!result?.rows[0]) throw new Error("Only a processing document batch can be canceled.");
  return { id: result.rows[0].id, status: result.rows[0].status };
}
