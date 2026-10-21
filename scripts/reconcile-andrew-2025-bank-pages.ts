import { queryPostgres } from "../src/lib/db/postgres";

const projectId = "87bd03cf-6835-41ff-b882-a50a800e3f5d";

async function main() {
  const project = await queryPostgres<{
    document_count: number;
    transaction_count: number;
    credit_count: number;
    debit_count: number;
    credit_cents: string;
    debit_cents: string;
    first_date: string | null;
    last_date: string | null;
  }>(`
    with documents as (
      select distinct bi.document_id
      from public.document_intelligence_import_batches b
      join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      where b.project_id=$1 and bi.document_id is not null
    ), transactions as (
      select distinct t.id,t.direction,t.amount_cents,t.transaction_date
      from documents d join public.document_intelligence_transactions t on t.document_id=d.document_id
    )
    select (select count(*)::int from documents) as document_count,
      count(*)::int as transaction_count,
      count(*) filter (where direction='credit')::int as credit_count,
      count(*) filter (where direction='debit')::int as debit_count,
      coalesce(sum(amount_cents) filter (where direction='credit'),0)::bigint::text as credit_cents,
      coalesce(sum(amount_cents) filter (where direction='debit'),0)::bigint::text as debit_cents,
      min(transaction_date)::text as first_date,max(transaction_date)::text as last_date
    from transactions
  `, [projectId]);

  const documents = await queryPostgres<{
    document_id: string;
    file_name: string;
    text_length: number;
    row_count: number;
    credit_cents: string;
    debit_cents: string;
    first_date: string | null;
    last_date: string | null;
    extracted_text: string;
  }>(`
    with documents as (
      select distinct d.id::text as document_id,d.original_file_name as file_name,
        length(coalesce(d.extracted_text,''))::int as text_length,coalesce(d.extracted_text,'') as extracted_text
      from public.document_intelligence_import_batches b
      join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      join public.document_intelligence_documents d on d.id=bi.document_id and d.tenant_id=b.tenant_id
      where b.project_id=$1 and bi.document_id is not null
    )
    select d.document_id,d.file_name,d.text_length,d.extracted_text,
      coalesce(t.row_count,0)::int as row_count,coalesce(t.credit_cents,0)::bigint::text as credit_cents,
      coalesce(t.debit_cents,0)::bigint::text as debit_cents,t.first_date::text,t.last_date::text
    from documents d left join lateral (
      select count(*)::int as row_count,
        coalesce(sum(amount_cents) filter (where direction='credit'),0)::bigint as credit_cents,
        coalesce(sum(amount_cents) filter (where direction='debit'),0)::bigint as debit_cents,
        min(transaction_date) as first_date,max(transaction_date) as last_date
      from public.document_intelligence_transactions where document_id=d.document_id::uuid
    ) t on true
    order by t.first_date nulls last,d.file_name
  `, [projectId]);

  const movement = await queryPostgres<{
    bucket: string;
    row_count: number;
    amount_cents: string;
  }>(`
    with documents as (
      select distinct bi.document_id
      from public.document_intelligence_import_batches b
      join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      where b.project_id=$1 and bi.document_id is not null
    ), transactions as (
      select distinct t.* from documents d join public.document_intelligence_transactions t on t.document_id=d.document_id
    )
    select 'cash_app_credits' as bucket,count(*)::int as row_count,coalesce(sum(amount_cents),0)::bigint::text as amount_cents
      from transactions where direction='credit' and description ilike '%Cash App%'
    union all
    select 'from_8272_credits',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text
      from transactions where direction='credit' and description ~* '8272'
    union all
    select 'all_transfer_credits',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text
      from transactions where direction='credit' and is_transfer
    union all
    select 'all_transfer_debits',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text
      from transactions where direction='debit' and is_transfer
    union all
    select 'card_payment_debits',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text
      from transactions where direction='debit' and (description ~* '(CARD|BEST BUY).*(CCPYMT|PAYMENT|CREDITCARD)' or suggested_category ilike '%credit card payment%')
  `, [projectId]);

  const duplicateGroups = await queryPostgres<{
    transaction_date: string;
    direction: string;
    amount_cents: number;
    description: string;
    row_count: number;
    document_count: number;
  }>(`
    with documents as (
      select distinct bi.document_id
      from public.document_intelligence_import_batches b
      join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
      where b.project_id=$1 and bi.document_id is not null
    )
    select t.transaction_date::text,t.direction,t.amount_cents,lower(regexp_replace(trim(t.description),'\\s+',' ','g')) as description,
      count(*)::int as row_count,count(distinct t.document_id)::int as document_count
    from documents d join public.document_intelligence_transactions t on t.document_id=d.document_id
    group by 1,2,3,4 having count(*)>1
    order by count(*) desc,t.transaction_date,t.amount_cents
  `, [projectId]);

  const checking8272Payments = await queryPostgres<{
    transaction_date: string;
    description: string;
    amount_cents: number;
  }>(`
    select t.transaction_date::text,t.description,t.amount_cents
    from public.document_intelligence_transactions t
    join public.document_intelligence_documents d on d.id=t.document_id
    where d.original_file_name=any($1::text[]) and t.direction='debit'
      and (t.description ~* '(WELLS FARGO|BEST BUY|CREDIT ONE).*(CCPYMT|PAYMENT|AUTO PYMT)' or t.suggested_category ilike '%credit card payment%')
    order by t.transaction_date,t.position
  `, [["1000047846.jpg", "1000047848.jpg", "1000047849.jpg", "1000047850.jpg"]]);

  const newPageDebitSummary = await queryPostgres<{
    bucket: string;
    row_count: number;
    amount_cents: string;
  }>(`
    with new_documents as (
      select distinct document_id
      from public.document_intelligence_import_batch_items
      where batch_id='465032a6-8483-4a3d-a394-e9f0b62b4da6' and outcome='imported' and document_id is not null
    ), debits as (
      select distinct t.* from new_documents d
      join public.document_intelligence_transactions t on t.document_id=d.document_id
      where t.direction='debit'
    )
    select 'all_new_page_debits' as bucket,count(*)::int as row_count,coalesce(sum(amount_cents),0)::bigint::text as amount_cents from debits
    union all
    select 'transfers',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text from debits where is_transfer
    union all
    select 'card_payments',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text from debits
      where description ~* '(CCPYMT|CREDITCARD|AUTO PYMT|ONLINE PMT)' or suggested_category ilike '%credit card payment%'
    union all
    select 'direct_or_unresolved',count(*)::int,coalesce(sum(amount_cents),0)::bigint::text from debits
      where not is_transfer and not (description ~* '(CCPYMT|CREDITCARD|AUTO PYMT|ONLINE PMT)' or suggested_category ilike '%credit card payment%')
  `);

  const newPageDirectCategories = await queryPostgres<{
    category: string;
    row_count: number;
    amount_cents: string;
  }>(`
    with new_documents as (
      select distinct document_id
      from public.document_intelligence_import_batch_items
      where batch_id='465032a6-8483-4a3d-a394-e9f0b62b4da6' and outcome='imported' and document_id is not null
    )
    select coalesce(nullif(t.suggested_category,''),'Uncategorized') as category,count(*)::int as row_count,
      sum(t.amount_cents)::bigint::text as amount_cents
    from new_documents d join public.document_intelligence_transactions t on t.document_id=d.document_id
    where t.direction='debit' and not t.is_transfer
      and not (t.description ~* '(CCPYMT|CREDITCARD|AUTO PYMT|ONLINE PMT)' or t.suggested_category ilike '%credit card payment%')
    group by 1 order by sum(t.amount_cents) desc
  `);

  const newPageCrossSourceMatches = await queryPostgres<{
    matched_rows: number;
    matched_cents: string;
  }>(`
    with new_documents as (
      select distinct document_id
      from public.document_intelligence_import_batch_items
      where batch_id='465032a6-8483-4a3d-a394-e9f0b62b4da6' and outcome='imported' and document_id is not null
    ), new_debits as (
      select distinct t.id,t.tenant_id,t.transaction_date,t.amount_cents,
        lower(regexp_replace(trim(coalesce(t.merchant_name,t.description)),'\\s+',' ','g')) as merchant
      from new_documents d join public.document_intelligence_transactions t on t.document_id=d.document_id
      where t.direction='debit' and not t.is_transfer
        and not (t.description ~* '(CCPYMT|CREDITCARD|AUTO PYMT|ONLINE PMT)' or t.suggested_category ilike '%credit card payment%')
    ), matches as (
      select distinct n.id,n.amount_cents
      from new_debits n
      join public.document_intelligence_transactions t on t.tenant_id=n.tenant_id and t.id<>n.id
        and t.transaction_date=n.transaction_date and t.direction='debit' and t.amount_cents=n.amount_cents
        and lower(regexp_replace(trim(coalesce(t.merchant_name,t.description)),'\\s+',' ','g'))=n.merchant
      where t.document_id not in (select document_id from new_documents)
    )
    select count(*)::int as matched_rows,coalesce(sum(amount_cents),0)::bigint::text as matched_cents from matches
  `);

  const accountMentions = [...new Set((documents?.rows ?? []).flatMap((document) => {
    const matches = document.extracted_text.match(/(?:x{2,}|\*{2,}|ending\s+in\s+)?\d{4}\b/gi) ?? [];
    return matches.map((value) => value.replace(/\D/g, "")).filter((value) => value.length === 4);
  }))].sort();

  console.log(JSON.stringify({
    project: project?.rows[0] ?? null,
    movement: movement?.rows ?? [],
    accountMentions,
    mentions8272: (documents?.rows ?? []).filter((document) => /8272/i.test(document.extracted_text)).map((document) => ({
      fileName: document.file_name,
      lines: document.extracted_text.split(/\r?\n/).filter((line) => /8272/i.test(line))
        .map((line) => line.replace(/\d(?=\d{4}\b)/g, "#").slice(0, 220)),
    })),
    documents: (documents?.rows ?? []).map(({ extracted_text, ...document }) => ({
      ...document,
      headerEvidence: extracted_text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8)
        .map((line) => line.replace(/[0-9]/g, "#").slice(0, 180)),
    })),
    duplicateGroups: duplicateGroups?.rows ?? [],
    checking8272CardPayments: {
      rows: checking8272Payments?.rows ?? [],
      totalCents: (checking8272Payments?.rows ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0),
    },
    newPageDebitSummary: newPageDebitSummary?.rows ?? [],
    newPageDirectCategories: newPageDirectCategories?.rows ?? [],
    newPageCrossSourceMatches: newPageCrossSourceMatches?.rows[0] ?? null,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
