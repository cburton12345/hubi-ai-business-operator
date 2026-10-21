import { createHash } from "node:crypto";
import pg from "pg";

type ReceivedEmail = {
  id?: string;
  subject?: string;
  from?: string;
  to?: string[] | string;
  created_at?: string;
};

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
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${required(process.env.EMAIL_API_KEY, "EMAIL_API_KEY")}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Resend request failed (${response.status}).`);
  return response.json() as Promise<{ data?: unknown[] }>;
}

function recipients(value: string[] | string | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => item.toLowerCase());
}

async function main() {
  const databaseUrl = required(process.env.DATABASE_URL, "DATABASE_URL");
  const list = await resendJson("/emails/receiving?limit=100");
  const candidates = (Array.isArray(list.data) ? list.data : [])
    .filter((item): item is ReceivedEmail => Boolean(item && typeof item === "object"))
    .filter((email) => recipients(email.to).some((recipient) => recipient.includes("receipts+h4r@ferocity.live")));

  const emails: Array<ReceivedEmail & { attachments: ReceivedAttachment[] }> = [];
  for (const candidate of candidates.slice(0, 20)) {
    if (!candidate.id) continue;
    const payload = await resendJson(`/emails/receiving/${encodeURIComponent(candidate.id)}/attachments`);
    const attachments = (Array.isArray(payload.data) ? payload.data : [])
      .filter((item): item is ReceivedAttachment => Boolean(item && typeof item === "object"))
      .filter((item) => String(item.content_type ?? "").startsWith("image/") || item.content_type === "application/pdf");
    emails.push({ ...candidate, attachments });
  }

  const target = emails.find((email) => email.attachments.length === 21) ?? emails[0];
  if (!target?.id) throw new Error("No received Ferocity expense email was found.");

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const existing = await client.query<{ id: string; tenant_id: string; original_file_name: string; content_sha256: string }>(`
      select distinct d.id::text,d.tenant_id::text,d.original_file_name,d.content_sha256
      from public.document_intelligence_projects p
      join public.document_intelligence_import_batches b on b.project_id=p.id and b.tenant_id=p.tenant_id
      join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=b.tenant_id
      where p.name='Andrew 2025 - emailed documents'
    `);
    const byHash = new Map(existing.rows.map((row) => [row.content_sha256.toLowerCase(), row]));
    const recentBatches = await client.query<{ id: string; status: string; expected_file_count: number; imported_file_count: number; reused_file_count: number; failed_file_count: number }>(`
      select b.id::text,b.status,b.expected_file_count,b.imported_file_count,b.reused_file_count,b.failed_file_count
      from public.document_intelligence_import_batches b
      where b.project_id='87bd03cf-6835-41ff-b882-a50a800e3f5d'
      order by b.created_at desc limit 5
    `);
    const results: Array<{ fileName: string; byteCount: number; sha256: string; match: string | null }> = [];
    for (const [index, attachment] of target.attachments.entries()) {
      if (!attachment.download_url) throw new Error(`Attachment ${index + 1} has no download URL.`);
      const url = new URL(attachment.download_url);
      if (url.protocol !== "https:" || !(url.hostname === "resend.app" || url.hostname.endsWith(".resend.app") || url.hostname === "resend.com" || url.hostname.endsWith(".resend.com"))) {
        throw new Error(`Attachment ${index + 1} has an untrusted download host.`);
      }
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Attachment ${index + 1} download failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const match = byHash.get(sha256.toLowerCase());
      results.push({
        fileName: String(attachment.filename ?? `attachment-${index + 1}`),
        byteCount: bytes.byteLength,
        sha256,
        match: match ? `${match.id}:${match.original_file_name}` : null,
      });
    }
    console.log(JSON.stringify({
      recentEmails: emails.map((email) => ({
        id: email.id,
        subject: email.subject,
        createdAt: email.created_at,
        attachmentCount: email.attachments.length,
      })),
      tenantId: existing.rows[0]?.tenant_id ?? null,
      recentBatches: recentBatches.rows,
      email: { id: target.id, subject: target.subject, createdAt: target.created_at },
      attachmentCount: results.length,
      matchedExistingCount: results.filter((row) => row.match).length,
      newCount: results.filter((row) => !row.match).length,
      files: results.map((row, index) => ({ index: index + 1, fileName: row.fileName, byteCount: row.byteCount, existing: Boolean(row.match), existingDocument: row.match })),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
