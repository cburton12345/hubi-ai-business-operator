import pg from "pg";
import { generateJsonWithAiService } from "../src/lib/ai/ai-service";
import { independentReviewerConfigured } from "../src/lib/ai/model-routing";
import { statementCategories } from "../src/lib/document-intelligence/statement-classification-review";

const tenantId = "01dff823-0342-4319-bf6c-04f582f0d5e8";
const projectId = "1fad10d5-bef1-4bd3-bf54-ce6ac83ff597";
const primaryRunType = "expense_statement_classification";
const reviewerRunType = "independent_review_expense_statement_classification";

type Row = { id: string; transaction_date: string | null; description: string; amount_cents: number; direction: string };
type Proposal = { id: string; category: string; confidence: number; rationale: string };
type Response = { classifications: Proposal[] };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function proposals(value: Response, ids: Set<string>) {
  const allowed = new Set<string>(statementCategories);
  return new Map((Array.isArray(value.classifications) ? value.classifications : []).flatMap((item): Array<[string, Proposal]> => {
    const confidence = Number(item?.confidence);
    if (!item || !ids.has(item.id) || !allowed.has(item.category) || !Number.isFinite(confidence)) return [];
    return [[item.id, { ...item, confidence: Math.max(0, Math.min(1, confidence)), rationale: String(item.rationale ?? "").slice(0, 500) }]];
  }));
}

async function main() {
  if (!independentReviewerConfigured({ primaryRunType, reviewerRunType, requestType: "json" })) {
    throw new Error("A genuinely different independent statement-review model is not configured.");
  }
  const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query<Row>(`with docs as (
        select distinct bi.document_id from public.document_intelligence_import_batch_items bi
        join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
        where bi.tenant_id=$1 and b.project_id=$2
      ) select t.id::text,t.transaction_date::text,t.description,t.amount_cents,t.direction
      from public.document_intelligence_transactions t join docs d on d.document_id=t.document_id
      where t.direction='debit' and not t.is_transfer and t.suggested_category='uncategorized'
      order by t.amount_cents desc,t.id limit 25`, [tenantId, projectId]);
    if (result.rows.length > 25) throw new Error("Ambiguous review exceeded the hard cost cap.");
    if (!result.rows.length) {
      console.log(JSON.stringify({ reviewed: 0, agreed: 0, applied: 0 }, null, 2));
      return;
    }
    const payload = result.rows.map((row) => ({ id: row.id, date: row.transaction_date, description: row.description, amount_cents: row.amount_cents, direction: row.direction }));
    const request = {
      tenantId,
      featureKey: "expense_document_intelligence",
      aiCategory: "core" as const,
      temperature: 0.05,
      timeoutMs: 60_000,
      system: `Independently classify ambiguous Cash App debit descriptions using only these categories: ${statementCategories.join(", ")}. Return JSON only as {"classifications":[{"id":"...","category":"...","confidence":0.0,"rationale":"..."}]}. Do not decide tax deductibility, infer business purpose, or invent merchant facts. Use uncategorized whenever the description is insufficient.`,
      user: JSON.stringify({ transactions: payload }),
      fallback: { classifications: [] as Proposal[] },
    };
    const [primaryRaw, reviewerRaw] = await Promise.all([
      generateJsonWithAiService<Response>({ ...request, runType: primaryRunType }),
      generateJsonWithAiService<Response>({ ...request, runType: reviewerRunType }),
    ]);
    const ids = new Set(result.rows.map((row) => row.id));
    const primary = proposals(primaryRaw, ids);
    const reviewer = proposals(reviewerRaw, ids);
    const compared = result.rows.map((row) => {
      const first = primary.get(row.id) ?? null;
      const second = reviewer.get(row.id) ?? null;
      const agreed = Boolean(first && second && first.category === second.category && first.category !== "uncategorized" && first.confidence >= 0.8 && second.confidence >= 0.8);
      return { row, first, second, agreed, category: agreed ? first!.category : "uncategorized" };
    });
    await client.query("begin");
    try {
      for (const item of compared) {
        await client.query(`update public.document_intelligence_transactions set
          suggested_category=case when $3 then $4 else suggested_category end,
          metadata_json=metadata_json || jsonb_build_object('boundedIndependentClassificationReview',$5::jsonb),updated_at=now()
          where tenant_id=$1 and id=$2 and suggested_category='uncategorized'`, [
          tenantId, item.row.id, item.agreed, item.category, JSON.stringify({
            reviewedAt: new Date().toISOString(), primaryRunType, reviewerRunType,
            primary: item.first, reviewer: item.second, agreed: item.agreed,
            autoApplied: item.agreed, taxTreatmentConfirmed: false,
          }),
        ]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    const runs = await client.query<{ run_type: string; provider: string; model: string; status: string }>(`select distinct on (run_type)
      run_type,provider,model,status from public.ai_generation_runs where tenant_id=$1 and run_type=any($2::text[])
      order by run_type,created_at desc`, [tenantId, [primaryRunType, reviewerRunType]]);
    console.log(JSON.stringify({
      reviewed: compared.length,
      agreed: compared.filter((item) => item.agreed).length,
      applied: compared.filter((item) => item.agreed).map((item) => ({ id: item.row.id, category: item.category })),
      unresolved: compared.filter((item) => !item.agreed).map((item) => ({ id: item.row.id, description: item.row.description, primary: item.first, reviewer: item.second })),
      runs: runs.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
