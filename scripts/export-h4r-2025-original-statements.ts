import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const ownerEmail = "burtonchristopher125@gmail.com";
const projectName = "H4R 2025 tax documents";
const expectedNames = [
  "January 2025.pdf", "February 2025.pdf", "March 2025.pdf", "April 2025.pdf",
  "May 2025.pdf", "June 2025.pdf", "July 2025.pdf", "August 2025.pdf",
  "September 2025.pdf", "October 2025.pdf", "November 2025.pdf", "December 2025.pdf",
];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const outputDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!outputDirectory) throw new Error("Provide an explicit output directory.");
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const owner = await client.query(`select 1 from public.users u
      join public.tenant_users tu on tu.user_id=u.id and tu.tenant_id=$1
      join public.tenants t on t.id=tu.tenant_id
      where lower(u.email)=lower($2) and tu.status='active' and tu.role in ('owner','admin')
        and t.slug='h4r' and t.status='active'`, [tenantId, ownerEmail]);
    if (owner.rowCount !== 1) throw new Error("Expected H4R owner/workspace mapping was not found.");

    const documents = await client.query<{
      original_bucket: string; original_storage_path: string; original_file_name: string;
      original_byte_count: number; content_sha256: string;
    }>(`select distinct d.original_bucket,d.original_storage_path,d.original_file_name,
        d.original_byte_count,d.content_sha256
      from public.document_intelligence_projects p
      join public.document_intelligence_import_batches b on b.project_id=p.id and b.tenant_id=p.tenant_id
      join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
      where p.tenant_id=$1 and p.name=$2 and p.tax_year=2025 and p.status='active'
      order by d.original_file_name`, [tenantId, projectName]);
    const names = documents.rows.map((row) => row.original_file_name).sort();
    if (documents.rowCount !== 12 || JSON.stringify(names) !== JSON.stringify([...expectedNames].sort())) {
      throw new Error("The preserved project does not contain exactly the expected twelve monthly PDFs.");
    }

    await mkdir(outputDirectory, { recursive: true });
    const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const exported: Array<{ fileName: string; byteCount: number; sha256: string }> = [];
    for (const document of documents.rows) {
      const download = await supabase.storage.from(document.original_bucket).download(document.original_storage_path);
      if (download.error || !download.data) throw new Error(`${document.original_file_name} could not be downloaded.`);
      const bytes = Buffer.from(await download.data.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== Number(document.original_byte_count) || sha256 !== document.content_sha256) {
        throw new Error(`${document.original_file_name} failed preserved-byte verification.`);
      }
      await writeFile(path.join(outputDirectory, document.original_file_name), bytes, { flag: "wx" });
      exported.push({ fileName: document.original_file_name, byteCount: bytes.byteLength, sha256 });
    }
    console.log(JSON.stringify({ outputDirectory, documentCount: exported.length, totalBytes: exported.reduce((sum, row) => sum + row.byteCount, 0), documents: exported }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
