"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { getCurrentAppSession } from "@/lib/auth/session";
import {
  createConstructionFieldLogFallback,
  normalizeConstructionFieldLogDraft
} from "@/lib/construction/field-log";
import { getConstructionJobHealthDashboard, saveConstructionHealthSnapshots } from "@/lib/construction/job-health";
import { fieldLogNeedsReview } from "@/lib/controls/autonomy-policy";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const fieldLogSchema = z.object({
  jobId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rawNote: z.string().trim().min(10).max(5000)
});

const reviewSchema = z.object({
  logId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"])
});

function refreshPages() {
  revalidatePath("/app/job-tracker");
  revalidatePath("/app/job-tracker/health");
}

export async function prepareConstructionFieldLogAction(formData: FormData) {
  const parsed = fieldLogSchema.safeParse({
    jobId: formData.get("jobId"),
    logDate: formData.get("logDate")?.toString() || undefined,
    rawNote: formData.get("rawNote")
  });
  if (!parsed.success) return;

  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const gate = await getServiceGate(tenantId, "construction_job_health");
  if (!gate.enabled) return;

  const jobResult = await queryPostgres<{ id: string; title: string }>(
    `select id, title from public.service_jobs where id = $1 and tenant_id = $2 limit 1`,
    [parsed.data.jobId, tenantId]
  );
  const job = jobResult?.rows[0];
  if (!job) return;

  const fallback = createConstructionFieldLogFallback(parsed.data.rawNote);
  const generated = await generateJsonWithAiService<Record<string, unknown>>({
    tenantId,
    userId: session?.userId ?? null,
    featureKey: "construction_job_health",
    runType: "construction_field_log",
    temperature: 0.2,
    fallback: fallback as unknown as Record<string, unknown>,
    system: [
      "You prepare construction field notes for human review.",
      "Return JSON only with: summary, progressSummary, delaySummary, materialSummary, safetySummary, conflictSummary, weatherSummary, customerUpdateDraft, confidence, riskFlags, suggestedActions, assumptions, missingInformation.",
      "riskFlags must be an array of {category,severity,title,detail}.",
      "Categories: money, schedule, procurement, change, safety, information. Severities: low, medium, high, critical.",
      "Never invent facts. Separate observations from assumptions. Flag missing information.",
      "Do not make code, safety, contract, payment, schedule, disciplinary, or change-order decisions.",
      "The customer update is a draft and must not claim unverified facts."
    ].join(" "),
    user: `Job: ${job.title}\nField note:\n${parsed.data.rawNote}`,
    metadata: {
      jobId: job.id,
      source: "human_field_note",
      reviewRequired: true
    }
  });
  const draft = normalizeConstructionFieldLogDraft(generated, fallback);
  const needsReview = fieldLogNeedsReview(gate.mode, draft.riskFlags);
  const logStatus = needsReview ? "needs_review" : "approved";
  const evidence = [{
    source: "human_field_note",
    label: "Original field note",
    detail: parsed.data.rawNote,
    verified: false
  }, {
    source: "ferocity_ai",
    label: "Prepared interpretation",
    detail: needsReview
      ? "AI-prepared interpretation. This log needs human review because of its control setting or risk."
      : "AI-prepared interpretation auto-filed under the owner's autonomy setting. No external action was taken.",
    verified: false,
    confidence: draft.confidence
  }];

  await queryPostgres(
    `
    insert into public.construction_daily_logs (
      tenant_id, service_job_id, log_date, raw_note, summary, progress_summary,
      delay_summary, material_summary, safety_summary, conflict_summary,
      weather_summary, customer_update_draft, status, confidence,
      risk_flags_json, suggested_actions_json, evidence_json, metadata_json,
      created_by_user_id, approved_at
    )
    values (
      $1,$2,coalesce($3::date,current_date),$4,$5,$6,$7,$8,$9,$10,$11,$12,
      $13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19,
      case when $13 = 'approved' then now() else null end
    )
    `,
    [
      tenantId,
      job.id,
      parsed.data.logDate ?? null,
      parsed.data.rawNote,
      draft.summary,
      draft.progressSummary || null,
      draft.delaySummary || null,
      draft.materialSummary || null,
      draft.safetySummary || null,
      draft.conflictSummary || null,
      draft.weatherSummary || null,
      draft.customerUpdateDraft || null,
      logStatus,
      draft.confidence,
      JSON.stringify(draft.riskFlags),
      JSON.stringify(draft.suggestedActions),
      JSON.stringify(evidence),
      JSON.stringify({
        assumptions: draft.assumptions,
        missingInformation: draft.missingInformation,
        customerUpdateStatus: "draft_not_sent",
        automaticMutations: false,
        autoFiled: !needsReview,
        autonomyMode: gate.mode
      }),
      session?.userId ?? null
    ]
  );

  refreshPages();
}

export async function reviewConstructionFieldLogAction(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    logId: formData.get("logId"),
    decision: formData.get("decision")
  });
  if (!parsed.success) return;

  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  await queryPostgres(
    `
    update public.construction_daily_logs
    set status = $3,
        approved_by_user_id = case when $3 = 'approved' then $4 else null end,
        approved_at = case when $3 = 'approved' then now() else null end,
        updated_at = now()
    where id = $1 and tenant_id = $2 and status in ('draft', 'needs_review')
    `,
    [parsed.data.logId, tenantId, parsed.data.decision, session?.userId ?? null]
  );
  refreshPages();
}

export async function refreshConstructionHealthAction() {
  const tenantId = await getCurrentWorkspaceId();
  const dashboard = await getConstructionJobHealthDashboard();
  await saveConstructionHealthSnapshots(tenantId, dashboard.jobs);
  refreshPages();
}
