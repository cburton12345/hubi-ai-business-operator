import { queryPostgres } from "@/lib/db/postgres";

export const STATEMENT_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type StatementYearCoverage = {
  year: number;
  presentMonths: string[];
  missingMonths: string[];
  statementCount: number;
  complete: boolean;
  message: string;
};

export function summarizeStatementYearCoverage(year: number, monthNumbers: number[], statementCount = monthNumbers.length): StatementYearCoverage {
  const presentNumbers = [...new Set(monthNumbers)]
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    .sort((a, b) => a - b);
  const present = new Set(presentNumbers);
  const presentMonths = presentNumbers.map((month) => STATEMENT_MONTHS[month - 1]);
  const missingMonths = STATEMENT_MONTHS.filter((_, index) => !present.has(index + 1));
  const complete = missingMonths.length === 0;
  return {
    year,
    presentMonths,
    missingMonths,
    statementCount,
    complete,
    message: complete
      ? `All 12 monthly statement periods are represented for ${year}.`
      : `${missingMonths.join(", ")} ${missingMonths.length === 1 ? "statement was" : "statements were"} not provided for ${year}. This covers ${presentMonths.length} of 12 monthly statement periods and is incomplete.`,
  };
}

export async function getStatementYearCoverage(tenantId: string, year: number, scope?: {
  projectId?: string | null;
  batchId?: string | null;
}): Promise<StatementYearCoverage | null> {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  try {
    const result = await queryPostgres<{ statement_month: string; statement_count: string }>(`
      select extract(month from d.document_date)::int::text as statement_month,
        count(*)::text as statement_count
      from public.document_intelligence_documents d
      where d.tenant_id = $1
        and d.document_type = 'statement'
        and lower(coalesce(d.vendor_name, '')) = 'cash app'
        and d.document_date >= make_date($2::int, 1, 1)
        and d.document_date < make_date(($2::int + 1), 1, 1)
        and d.status not in ('failed', 'rejected')
        and ($3::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=d.tenant_id and bi.document_id=d.id and b.project_id=$3::uuid
        ))
        and ($4::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          where bi.tenant_id=d.tenant_id and bi.document_id=d.id and bi.batch_id=$4::uuid
        ))
      group by extract(month from d.document_date)
      order by extract(month from d.document_date)
    `, [tenantId, year, scope?.projectId ?? null, scope?.batchId ?? null]);
    const rows = result?.rows ?? [];
    if (!rows.length) return null;
    return summarizeStatementYearCoverage(
      year,
      rows.map((row) => Number(row.statement_month)),
      rows.reduce((sum, row) => sum + Number(row.statement_count || 0), 0),
    );
  } catch {
    return null;
  }
}

export async function getStatementCoverageForDocument(tenantId: string, documentId: string) {
  try {
    const result = await queryPostgres<{ document_year: string }>(`
      select extract(year from document_date)::int::text as document_year
      from public.document_intelligence_documents
      where tenant_id = $1 and id = $2 and document_type = 'statement'
        and lower(coalesce(vendor_name, '')) = 'cash app'
      limit 1
    `, [tenantId, documentId]);
    const year = Number(result?.rows[0]?.document_year);
    return Number.isInteger(year) ? getStatementYearCoverage(tenantId, year) : null;
  } catch {
    return null;
  }
}
