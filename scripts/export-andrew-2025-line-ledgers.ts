import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const cashAppProjectId = "2d410b25-c9c7-46e5-85ec-d1caee79b8cf";
const creditCardProjectId = "cc250734-309f-4f18-bca3-aab08c2af3e7";
const bankBatchId = "9ecd5579-8fe1-457c-b992-3c88e082f6ef";

type LedgerRow = {
  id: string;
  source_file: string;
  transaction_date: string | null;
  description: string;
  merchant_name: string | null;
  direction: "debit" | "credit";
  amount_cents: string | number | bigint;
  is_transfer: boolean;
  suggested_category: string;
  status: string;
};

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
    const projectRows = async (projectId: string) => (await client.query<LedgerRow>(`
      with scoped_documents as (
        select distinct d.id,d.original_file_name
        from public.document_intelligence_import_batches b
        join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
        join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
        where b.tenant_id=$1 and b.project_id=$2
      )
      select distinct on (t.id) t.id::text,d.original_file_name as source_file,t.transaction_date::text,
        coalesce(nullif(t.description,''),'Description unavailable') as description,t.merchant_name,
        t.direction,t.amount_cents::bigint,t.is_transfer,
        coalesce(nullif(t.suggested_category,''),'Uncategorized') as suggested_category,t.status
      from public.document_intelligence_transactions t
      join scoped_documents d on d.id=t.document_id
      where t.tenant_id=$1
      order by t.id,t.transaction_date,t.created_at
    `, [tenantId, projectId])).rows;

    const cashApp = await projectRows(cashAppProjectId);
    const creditCard = await projectRows(creditCardProjectId);
    const bank = (await client.query<LedgerRow>(`
      select distinct on (t.id) t.id::text,d.original_file_name as source_file,t.transaction_date::text,
        coalesce(nullif(t.description,''),'Description unavailable') as description,t.merchant_name,
        t.direction,t.amount_cents::bigint,t.is_transfer,
        coalesce(nullif(t.suggested_category,''),'Uncategorized') as suggested_category,t.status
      from public.document_intelligence_import_batch_items bi
      join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=bi.tenant_id
      join public.document_intelligence_transactions t on t.document_id=bi.document_id and t.tenant_id=bi.tenant_id
      where bi.batch_id=$1 and bi.tenant_id=$2
      order by t.id,t.transaction_date,t.created_at
    `, [bankBatchId, tenantId])).rows;

    const normalize = (rows: LedgerRow[]) => rows
      .map((row) => ({ ...row, amount_cents: Number(row.amount_cents) }))
      .sort((a, b) => String(a.transaction_date ?? "").localeCompare(String(b.transaction_date ?? ""))
        || String(a.description).localeCompare(String(b.description)) || String(a.id).localeCompare(String(b.id)));
    const normalized = { cashApp: normalize(cashApp), creditCard: normalize(creditCard), bank: normalize(bank) };
    const totals = (rows: typeof normalized.cashApp) => rows.reduce<Record<string, { count: number; cents: number }>>((acc, row) => {
      const key = `${row.direction}:${row.is_transfer ? "transfer" : "nontransfer"}`;
      const current = acc[key] ?? { count: 0, cents: 0 };
      current.count += 1;
      current.cents += row.amount_cents;
      acc[key] = current;
      return acc;
    }, {});
    const controls = {
      cashApp: { rows: normalized.cashApp.length, totals: totals(normalized.cashApp) },
      creditCard: { rows: normalized.creditCard.length, totals: totals(normalized.creditCard) },
      bank: { rows: normalized.bank.length, totals: totals(normalized.bank) },
    };
    if (controls.cashApp.rows !== 445
      || controls.cashApp.totals["credit:nontransfer"]?.cents !== 18_622_827
      || controls.cashApp.totals["debit:nontransfer"]?.cents !== 5_556_074
      || controls.cashApp.totals["debit:transfer"]?.cents !== 13_259_135) {
      throw new Error(`Cash App controls failed: ${JSON.stringify(controls.cashApp)}`);
    }
    if (controls.creditCard.rows !== 652
      || controls.creditCard.totals["debit:nontransfer"]?.cents !== 6_492_769
      || controls.creditCard.totals["credit:nontransfer"]?.cents !== 75_015
      || controls.creditCard.totals["credit:transfer"]?.cents !== 6_228_646) {
      throw new Error(`Credit-card controls failed: ${JSON.stringify(controls.creditCard)}`);
    }
    const bankCredit = Object.entries(controls.bank.totals).filter(([key]) => key.startsWith("credit:"))
      .reduce((sum, [, value]) => sum + value.cents, 0);
    const bankDebit = Object.entries(controls.bank.totals).filter(([key]) => key.startsWith("debit:"))
      .reduce((sum, [, value]) => sum + value.cents, 0);
    if (controls.bank.rows !== 253 || bankCredit !== 9_317_870 || bankDebit !== 8_913_732) {
      throw new Error(`Bank controls failed: ${JSON.stringify(controls.bank)}`);
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify({ controls, ...normalized }, null, 2), "utf8");
    console.log(JSON.stringify({ outputPath, controls }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
