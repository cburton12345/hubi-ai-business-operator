import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectName = "H4R 2025 — Credit Card";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!outputPath) throw new Error("Provide an explicit output JSON path.");

  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const project = await client.query<{ id: string }>(
      `select id from public.document_intelligence_projects
       where tenant_id=$1 and name=$2 and tax_year=2025 and status='active'`,
      [tenantId, projectName],
    );
    if (project.rowCount !== 1) throw new Error(`Expected one active ${projectName} project.`);

    const result = await client.query(
      `select t.id::text,
          t.transaction_date::text,
          coalesce(nullif(t.description,''),'Description unavailable') as description,
          t.merchant_name,
          t.direction,
          t.amount_cents::bigint,
          t.is_transfer,
          coalesce(nullif(t.suggested_category,''),'uncategorized') as suggested_category,
          t.status,
          coalesce(nullif(t.metadata_json->'h4r2025Review'->'merchantLocation'->>'city',''),nullif(t.metadata_json->>'merchantCity','')) as merchant_city,
          coalesce(nullif(t.metadata_json->'h4r2025Review'->'merchantLocation'->>'state',''),nullif(t.metadata_json->>'merchantState','')) as merchant_state
       from public.document_intelligence_transactions t
       where t.tenant_id=$1
         and exists (
           select 1
           from public.document_intelligence_import_batch_items bi
           join public.document_intelligence_import_batches b
             on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
           where bi.tenant_id=t.tenant_id
             and bi.document_id=t.document_id
             and b.project_id=$2
         )
       order by t.transaction_date,t.created_at,t.id`,
      [tenantId, project.rows[0].id],
    );

    const rows = result.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }));
    const purchases = rows.filter((row) => row.direction === "debit" && !row.is_transfer);
    const refunds = rows.filter((row) => row.direction === "credit" && !row.is_transfer);
    const transfers = rows.filter((row) => row.is_transfer);
    const sum = (items: typeof rows) => items.reduce((total, row) => total + row.amount_cents, 0);

    const controls = {
      allRows: rows.length,
      purchaseRows: purchases.length,
      purchaseCents: sum(purchases),
      refundRows: refunds.length,
      refundCents: sum(refunds),
      transferRows: transfers.length,
      transferCents: sum(transfers),
      netPurchaseCents: sum(purchases) - sum(refunds),
    };
    if (controls.allRows !== 652 || controls.purchaseRows !== 630 || controls.purchaseCents !== 6_492_769
      || controls.refundRows !== 8 || controls.refundCents !== 75_015
      || controls.transferRows !== 14 || controls.transferCents !== 6_228_646
      || controls.netPurchaseCents !== 6_417_754) {
      throw new Error(`Credit-card reconciliation failed: ${JSON.stringify(controls)}`);
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify({ projectName, controls, purchases, refunds }, null, 2), "utf8");
    console.log(JSON.stringify({ outputPath, controls }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
