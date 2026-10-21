import { queryPostgres } from "../src/lib/db/postgres";

const batchId = "9ecd5579-8fe1-457c-b992-3c88e082f6ef";

async function main() {
const summary = await queryPostgres<{
  direction: "credit" | "debit";
  is_transfer: boolean;
  category: string;
  row_count: number;
  amount_cents: string;
}>(`
  select t.direction,t.is_transfer,coalesce(t.suggested_category,'Uncategorized') as category,
    count(*)::int as row_count,sum(t.amount_cents)::bigint::text as amount_cents
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1
  group by t.direction,t.is_transfer,coalesce(t.suggested_category,'Uncategorized')
  order by t.direction,t.is_transfer,sum(t.amount_cents) desc
`, [batchId]);

const highValue = await queryPostgres<{
  transaction_date: string;
  description: string;
  direction: "credit" | "debit";
  is_transfer: boolean;
  category: string;
  amount_cents: number;
}>(`
  select t.transaction_date::text,t.description,t.direction,t.is_transfer,
    coalesce(t.suggested_category,'Uncategorized') as category,t.amount_cents
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.amount_cents>=100000
  order by t.amount_cents desc,t.transaction_date
`, [batchId]);

const relatedProjects = await queryPostgres<{
  project_id: string;
  project_name: string;
  tax_year: number | null;
  document_count: number;
  transaction_count: number;
  credit_cents: string;
  debit_cents: string;
}>(`
  select p.id as project_id,p.name as project_name,p.tax_year,
    count(distinct bi.document_id)::int as document_count,
    count(distinct t.id)::int as transaction_count,
    coalesce(sum(t.amount_cents) filter (where t.direction='credit'),0)::bigint::text as credit_cents,
    coalesce(sum(t.amount_cents) filter (where t.direction='debit'),0)::bigint::text as debit_cents
  from public.document_intelligence_projects p
  left join public.document_intelligence_import_batches b on b.project_id=p.id and b.tenant_id=p.tenant_id
  left join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
  left join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where p.tenant_id=(select tenant_id from public.document_intelligence_import_batches where id=$1)
    and p.status='active'
  group by p.id,p.name,p.tax_year
  order by p.updated_at desc
`, [batchId]);

const nonTransferCredits = await queryPostgres<{
  transaction_date: string;
  description: string;
  amount_cents: number;
  category: string;
}>(`
  select t.transaction_date::text,t.description,t.amount_cents,
    coalesce(t.suggested_category,'Uncategorized') as category
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='credit' and not t.is_transfer
  order by t.transaction_date,t.position
`, [batchId]);

const reconciliation = await queryPostgres<{
  metric: string;
  row_count: number;
  amount_cents: string;
}>(`
  select 'cash_app_credits' as metric,count(*)::int as row_count,sum(t.amount_cents)::bigint::text as amount_cents
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='credit' and t.description ilike '%Cash App%'
  union all
  select 'card_payment_debits',count(*)::int,sum(t.amount_cents)::bigint::text
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='debit'
    and (t.description ~* '(CARD|BEST BUY).*(CCPYMT|PAYMENT|CREDITCARD)' or t.suggested_category ilike '%credit card payment%')
  union all
  select 'explicit_rent_credits',count(*)::int,sum(t.amount_cents)::bigint::text
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='credit' and t.description ~* 'rent'
  union all
  select 'obvious_movement_debits',count(*)::int,sum(t.amount_cents)::bigint::text
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='debit' and (
    t.is_transfer
    or t.description ~* '(CARD|BEST BUY).*(CCPYMT|PAYMENT|CREDITCARD)'
    or t.suggested_category ilike '%credit card payment%'
  )
  union all
  select 'obvious_movement_credits',count(*)::int,sum(t.amount_cents)::bigint::text
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='credit' and (
    t.is_transfer or t.description ilike '%Cash App%' or t.description ilike '%VENMO - CASHOUT%'
    or t.description ~* 'Internet Transfer FROM: XXXX8272'
  )
`, [batchId]);

const portfolioControls = await queryPostgres<{
  project_name: string;
  direction: "credit" | "debit";
  is_transfer: boolean;
  row_count: number;
  amount_cents: string;
}>(`
  select project_name,direction,is_transfer,count(*)::int as row_count,sum(amount_cents)::bigint::text as amount_cents
  from (
    select distinct p.name as project_name,t.id,t.direction,t.is_transfer,t.amount_cents
    from public.document_intelligence_projects p
    join public.document_intelligence_import_batches b on b.project_id=p.id and b.tenant_id=p.tenant_id
    join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
    join public.document_intelligence_transactions t on t.document_id=bi.document_id
    where p.id in ('2d410b25-c9c7-46e5-85ec-d1caee79b8cf','cc250734-309f-4f18-bca3-aab08c2af3e7')
  ) scoped
  group by project_name,direction,is_transfer
  order by project_name,direction,is_transfer
`, []);

const unresolvedDebits = await queryPostgres<{
  transaction_date: string;
  description: string;
  merchant_name: string | null;
  amount_cents: number;
  category: string;
}>(`
  select t.transaction_date::text,t.description,t.merchant_name,t.amount_cents,
    coalesce(t.suggested_category,'Uncategorized') as category
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='debit' and not (
    t.is_transfer
    or t.description ~* '(CARD|BEST BUY).*(CCPYMT|PAYMENT|CREDITCARD)'
    or t.suggested_category ilike '%credit card payment%'
  )
  order by t.amount_cents desc,t.transaction_date,t.position
`, [batchId]);

const unresolvedMerchantTotals = await queryPostgres<{
  merchant: string;
  category: string;
  row_count: number;
  amount_cents: string;
}>(`
  select coalesce(nullif(t.merchant_name,''),regexp_replace(t.description,'^(Check #[0-9]+: Check|Descriptive Withdrawal |Withdrawal)$','\\1')) as merchant,
    coalesce(t.suggested_category,'Uncategorized') as category,count(*)::int as row_count,
    sum(t.amount_cents)::bigint::text as amount_cents
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='debit' and not (
    t.is_transfer
    or t.description ~* '(CARD|BEST BUY).*(CCPYMT|PAYMENT|CREDITCARD)'
    or t.suggested_category ilike '%credit card payment%'
  )
  group by 1,2
  order by sum(t.amount_cents) desc
`, [batchId]);

const sensitiveBankDebits = await queryPostgres<{
  transaction_date: string;
  description: string;
  merchant_name: string | null;
  amount_cents: number;
  category: string;
}>(`
  select distinct t.transaction_date::text,t.description,t.merchant_name,t.amount_cents,
    coalesce(t.suggested_category,'Uncategorized') as category
  from public.document_intelligence_import_batch_items bi
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where bi.batch_id=$1 and t.direction='debit' and upper(coalesce(t.merchant_name,'')) in (
    'BEST BUY','TRACTOR SUPPLY','SYNCHRONY BANK','AFFIRM INC',
    'GMWD FITNESS','KURU FOOTWEAR','DAIRYLAND MANA','DAIRYLAND MAN','CAPITAL ONE'
  )
  order by 1,2,4
`, [batchId]);

const sensitiveCardTransactions = await queryPostgres<{
  transaction_date: string;
  description: string;
  merchant_name: string | null;
  direction: "credit" | "debit";
  is_transfer: boolean;
  amount_cents: number;
  category: string;
}>(`
  select distinct t.transaction_date::text,t.description,t.merchant_name,t.direction,t.is_transfer,
    t.amount_cents,coalesce(t.suggested_category,'Uncategorized') as category
  from public.document_intelligence_import_batches b
  join public.document_intelligence_import_batch_items bi on bi.batch_id=b.id and bi.tenant_id=b.tenant_id
  join public.document_intelligence_transactions t on t.document_id=bi.document_id
  where b.project_id='cc250734-309f-4f18-bca3-aab08c2af3e7' and upper(coalesce(t.merchant_name,'')) in (
    'BEST BUY','TRACTOR SUPPLY','SYNCHRONY BANK','AFFIRM INC',
    'GMWD FITNESS','KURU FOOTWEAR','DAIRYLAND MANA','DAIRYLAND MAN','CAPITAL ONE'
  )
  order by 1,2,6
`, []);

console.log(JSON.stringify({
  summary: summary?.rows ?? [],
  highValue: highValue?.rows ?? [],
  relatedProjects: relatedProjects?.rows ?? [],
  nonTransferCredits: nonTransferCredits?.rows ?? [],
  reconciliation: reconciliation?.rows ?? [],
  portfolioControls: portfolioControls?.rows ?? [],
  unresolvedDebits: unresolvedDebits?.rows ?? [],
  unresolvedMerchantTotals: unresolvedMerchantTotals?.rows ?? [],
  sensitiveBankDebits: sensitiveBankDebits?.rows ?? [],
  sensitiveCardTransactions: sensitiveCardTransactions?.rows ?? [],
}, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
