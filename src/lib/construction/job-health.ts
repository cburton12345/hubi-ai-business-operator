import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ConstructionEvidence = {
  source: string;
  label: string;
  value: string;
  detail: string;
  href?: string;
};

export type ConstructionRisk = {
  key: string;
  category: "money" | "schedule" | "procurement" | "change" | "safety" | "information";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  recommendation: string;
  evidence: ConstructionEvidence[];
};

export type ConstructionDailyRiskFlag = {
  category: ConstructionRisk["category"];
  severity: ConstructionRisk["severity"];
  title: string;
  detail: string;
};

export type ConstructionJobHealthInput = {
  id: string;
  title: string;
  customerName: string;
  status: string;
  scheduledStart: Date | string | null;
  scheduledEnd: Date | string | null;
  estimateId: string | null;
  estimateTotalCents: number;
  approvedChangeCents: number;
  pendingChangeCount: number;
  expenseCents: number;
  materialActualCents: number;
  materialLogCents: number;
  peoplePaidCents: number;
  invoiceTotalCents: number;
  invoicePaidCents: number;
  overdueInvoiceCount: number;
  unreviewedExpenseCount: number;
  blockingWarningCount: number;
  openWarningCount: number;
  blockedAssignmentCount: number;
  missedAssignmentCount: number;
  overduePurchaseOrderCount: number;
  committedPurchaseOrderCents: number;
  recentDailyFlags: ConstructionDailyRiskFlag[];
};

export type ConstructionJobHealth = {
  id: string;
  title: string;
  customerName: string;
  jobStatus: string;
  healthStatus: "on_track" | "needs_information" | "money_risk" | "schedule_risk" | "procurement_risk" | "safety_risk" | "needs_attention";
  severity: ConstructionRisk["severity"];
  projectValueCents: number;
  trackedCostCents: number;
  committedCostCents: number;
  invoicedCents: number;
  paidCents: number;
  costToValuePercent: number | null;
  risks: ConstructionRisk[];
  evidence: ConstructionEvidence[];
  href: string;
};

const severityRank: Record<ConstructionRisk["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function evidence(source: string, label: string, value: string, detail: string, href?: string): ConstructionEvidence {
  return { source, label, value, detail, href };
}

export function assessConstructionJobHealth(input: ConstructionJobHealthInput): ConstructionJobHealth {
  const projectValueCents = Math.max(input.estimateTotalCents + input.approvedChangeCents, input.invoiceTotalCents);
  const materialBasisCents = Math.max(input.expenseCents, input.materialActualCents, input.materialLogCents);
  const trackedCostCents = materialBasisCents + input.peoplePaidCents;
  const costToValuePercent = projectValueCents > 0 ? (trackedCostCents / projectValueCents) * 100 : null;
  const risks: ConstructionRisk[] = [];
  const jobHref = `/app/service/jobs/${input.id}`;

  if (!input.estimateId || projectValueCents <= 0) {
    risks.push({
      key: "missing_price",
      category: "information",
      severity: "medium",
      title: "Project price is missing",
      explanation: "Ferocity cannot judge cost exposure until the job is connected to an estimate or invoice value.",
      recommendation: "Connect or create the reviewed estimate before relying on margin warnings.",
      evidence: [evidence("service_jobs", "Estimate connection", input.estimateId ? "Connected without value" : "Not connected", "Job and estimate relationship.", jobHref)]
    });
  }

  if (costToValuePercent !== null) {
    const threshold = input.status === "completed" ? 90 : 70;
    const highThreshold = input.status === "completed" ? 100 : 85;
    if (costToValuePercent >= threshold) {
      const severity = costToValuePercent >= highThreshold ? "high" : "medium";
      risks.push({
        key: "cost_exposure",
        category: "money",
        severity,
        title: severity === "high" ? "Tracked costs are consuming the project value" : "Cost exposure needs review",
        explanation: `${money(trackedCostCents)} of ${money(projectValueCents)} is already represented by tracked expenses/materials and people payments.`,
        recommendation: "Review receipts, material entries, labor payments, remaining scope, and unpriced changes before more work is committed.",
        evidence: [
          evidence("service_estimates", "Project value", money(projectValueCents), "Estimate plus approved changes, compared with invoiced value.", input.estimateId ? `/app/service/estimates/${input.estimateId}` : jobHref),
          evidence("operations_costs", "Tracked cost basis", money(trackedCostCents), "Uses the largest recorded material/expense basis plus people payments to reduce obvious double-counting.", jobHref),
          evidence("construction_calculation", "Cost-to-value", percent(costToValuePercent), "Directional exposure, not final accounting.")
        ]
      });
    }
  }

  if (input.overdueInvoiceCount > 0 && input.invoiceTotalCents > input.invoicePaidCents) {
    risks.push({
      key: "overdue_money",
      category: "money",
      severity: "high",
      title: "Customer money is overdue",
      explanation: `${input.overdueInvoiceCount} overdue invoice${input.overdueInvoiceCount === 1 ? "" : "s"} still have an unpaid balance.`,
      recommendation: "Review the invoice, customer history, dispute status, and prepared reminder before contacting the customer.",
      evidence: [evidence("service_invoices", "Unpaid balance", money(Math.max(input.invoiceTotalCents - input.invoicePaidCents, 0)), "Invoiced total minus recorded payments.", "/app/cash-collection")]
    });
  }

  if (input.unreviewedExpenseCount > 0) {
    risks.push({
      key: "unreviewed_costs",
      category: "money",
      severity: "medium",
      title: "Costs are waiting for review",
      explanation: `${input.unreviewedExpenseCount} job expense${input.unreviewedExpenseCount === 1 ? "" : "s"} may change profit after approval.`,
      recommendation: "Approve, correct, reject, or reassign the receipts before trusting job profit.",
      evidence: [evidence("operations_expenses", "Needs review", String(input.unreviewedExpenseCount), "Receipts and expenses tied to this job.", "/app/job-tracker#record-cost")]
    });
  }

  if (input.pendingChangeCount > 0) {
    risks.push({
      key: "unapproved_changes",
      category: "change",
      severity: "high",
      title: "Extra work may be unpriced",
      explanation: `${input.pendingChangeCount} change order${input.pendingChangeCount === 1 ? "" : "s"} are not approved.`,
      recommendation: "Confirm scope, customer authorization, price, and schedule impact before continuing the changed work.",
      evidence: [evidence("estimate_change_orders", "Pending changes", String(input.pendingChangeCount), "Draft or sent changes connected to the source estimate.", input.estimateId ? `/app/service/estimates/${input.estimateId}` : jobHref)]
    });
  }

  if (input.blockedAssignmentCount > 0 || input.missedAssignmentCount > 0) {
    const count = input.blockedAssignmentCount + input.missedAssignmentCount;
    risks.push({
      key: "field_work_blocked",
      category: "schedule",
      severity: "high",
      title: "Scheduled work is blocked or missed",
      explanation: `${count} assignment${count === 1 ? "" : "s"} are marked blocked or missed.`,
      recommendation: "Confirm the blocker, responsible person, materials, customer access, and the next achievable date.",
      evidence: [evidence("operations_assignments", "Blocked or missed", String(count), "Current assignment statuses.", "/app/operations-workforce")]
    });
  }

  if (input.scheduledEnd && !["completed", "canceled", "lost"].includes(input.status)) {
    const scheduledEnd = new Date(input.scheduledEnd);
    if (!Number.isNaN(scheduledEnd.getTime()) && scheduledEnd.getTime() < Date.now()) {
      risks.push({
        key: "past_scheduled_end",
        category: "schedule",
        severity: "high",
        title: "Job is past its scheduled finish",
        explanation: `The scheduled finish was ${scheduledEnd.toLocaleDateString()} but the job is still ${input.status.replaceAll("_", " ")}.`,
        recommendation: "Update progress, remaining scope, crew plan, customer expectation, and the realistic completion date.",
        evidence: [evidence("service_jobs", "Scheduled finish", scheduledEnd.toLocaleDateString(), "Current job schedule and status.", jobHref)]
      });
    }
  }

  if (input.overduePurchaseOrderCount > 0) {
    risks.push({
      key: "materials_overdue",
      category: "procurement",
      severity: "high",
      title: "Required materials may be late",
      explanation: `${input.overduePurchaseOrderCount} purchase order${input.overduePurchaseOrderCount === 1 ? "" : "s"} passed the required date without delivery or reconciliation.`,
      recommendation: "Confirm supplier status, delivery location, substitutions, price changes, and schedule impact.",
      evidence: [evidence("purchase_orders", "Past required date", String(input.overduePurchaseOrderCount), `${money(input.committedPurchaseOrderCents)} is represented by open purchase orders.`, "/app/estimator")]
    });
  }

  if (input.blockingWarningCount > 0 || input.openWarningCount > 0) {
    risks.push({
      key: "estimate_warnings",
      category: "information",
      severity: input.blockingWarningCount > 0 ? "high" : "medium",
      title: "Estimate assumptions still need confirmation",
      explanation: `${input.blockingWarningCount} blocking and ${input.openWarningCount} other estimate warning${input.openWarningCount === 1 ? "" : "s"} remain open.`,
      recommendation: "Confirm measurements, scope, code, product, pricing, and assumptions before ordering or promising completion.",
      evidence: [evidence("estimate_warnings", "Open warnings", String(input.blockingWarningCount + input.openWarningCount), "Warnings from the reviewed takeoff and estimating flow.", input.estimateId ? `/app/service/estimates/${input.estimateId}` : jobHref)]
    });
  }

  for (const [index, flag] of input.recentDailyFlags.entries()) {
    risks.push({
      key: `daily_log_${index}_${flag.category}`,
      category: flag.category,
      severity: flag.severity,
      title: flag.title,
      explanation: flag.detail,
      recommendation: "Review the field note, confirm the facts, assign the next action, and update the affected job records.",
      evidence: [evidence("construction_daily_logs", "Field report", flag.severity, "AI-prepared flag from a human field note; review is required.", "/app/job-tracker/health")]
    });
  }

  const severity = risks.reduce<ConstructionRisk["severity"]>(
    (current, risk) => severityRank[risk.severity] > severityRank[current] ? risk.severity : current,
    "low"
  );
  const highestRisks = risks.filter((risk) => severityRank[risk.severity] === severityRank[severity]);
  const healthStatus: ConstructionJobHealth["healthStatus"] =
    highestRisks.some((risk) => risk.category === "safety") ? "safety_risk"
      : highestRisks.some((risk) => risk.category === "schedule") ? "schedule_risk"
        : highestRisks.some((risk) => risk.category === "money" || risk.category === "change") ? "money_risk"
          : highestRisks.some((risk) => risk.category === "procurement") ? "procurement_risk"
            : risks.some((risk) => risk.category === "information") ? "needs_information"
              : risks.length ? "needs_attention"
                : "on_track";

  const summaryEvidence = [
    evidence("service_estimates", "Project value", money(projectValueCents), "Estimate, approved changes, or invoiced value."),
    evidence("operations_costs", "Tracked cost", money(trackedCostCents), "Directional cost basis with anti-duplication assumption."),
    evidence("service_invoices", "Paid", money(input.invoicePaidCents), "Recorded invoice payments."),
    evidence("purchase_orders", "Committed purchasing", money(input.committedPurchaseOrderCents), "Open purchase orders.")
  ];

  return {
    id: input.id,
    title: input.title,
    customerName: input.customerName,
    jobStatus: input.status,
    healthStatus,
    severity,
    projectValueCents,
    trackedCostCents,
    committedCostCents: input.committedPurchaseOrderCents,
    invoicedCents: input.invoiceTotalCents,
    paidCents: input.invoicePaidCents,
    costToValuePercent,
    risks,
    evidence: summaryEvidence,
    href: jobHref
  };
}

type JobAggregateRow = {
  id: string;
  title: string;
  customer_name: string;
  status: string;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  estimate_id: string | null;
  estimate_total_cents: string | number;
  approved_change_cents: string | number;
  pending_change_count: string | number;
  expense_cents: string | number;
  material_actual_cents: string | number;
  material_log_cents: string | number;
  people_paid_cents: string | number;
  invoice_total_cents: string | number;
  invoice_paid_cents: string | number;
  overdue_invoice_count: string | number;
  unreviewed_expense_count: string | number;
  blocking_warning_count: string | number;
  open_warning_count: string | number;
  blocked_assignment_count: string | number;
  missed_assignment_count: string | number;
  overdue_purchase_order_count: string | number;
  committed_purchase_order_cents: string | number;
};

type DailyLogRow = {
  id: string;
  service_job_id: string;
  job_title: string;
  log_date: Date;
  summary: string;
  status: string;
  confidence: string;
  risk_flags_json: unknown;
  suggested_actions_json: unknown;
  created_at: Date;
};

function riskFlags(value: unknown): ConstructionDailyRiskFlag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const category = String(row.category ?? "information") as ConstructionDailyRiskFlag["category"];
    const severity = String(row.severity ?? "medium") as ConstructionDailyRiskFlag["severity"];
    if (!["money", "schedule", "procurement", "change", "safety", "information"].includes(category)) return [];
    if (!["low", "medium", "high", "critical"].includes(severity)) return [];
    return [{
      category,
      severity,
      title: String(row.title ?? "Field note needs review"),
      detail: String(row.detail ?? "Review the original field note.")
    }];
  });
}

export async function getConstructionJobHealthDashboardForTenant(tenantId: string) {
  const [jobsResult, logsResult] = await Promise.all([
    queryPostgres<JobAggregateRow>(
      `
      select
        j.id,
        j.title,
        c.name as customer_name,
        j.status,
        j.scheduled_start,
        j.scheduled_end,
        j.estimate_id,
        coalesce(e.total_cents, 0) as estimate_total_cents,
        coalesce((select sum(amount_cents) from public.estimate_change_orders co where co.tenant_id = j.tenant_id and co.estimate_id = j.estimate_id and co.status = 'approved'), 0) as approved_change_cents,
        coalesce((select count(*) from public.estimate_change_orders co where co.tenant_id = j.tenant_id and co.estimate_id = j.estimate_id and co.status in ('draft', 'sent_manually')), 0) as pending_change_count,
        coalesce((select sum(amount_cents + tax_cents) from public.operations_expenses x where x.tenant_id = j.tenant_id and x.service_job_id = j.id and x.status <> 'rejected'), 0) as expense_cents,
        coalesce((select sum(actual_cost_cents) from public.job_material_list_items m where m.tenant_id = j.tenant_id and m.service_job_id = j.id and m.status <> 'cancelled'), 0) as material_actual_cents,
        coalesce((select sum(cost_cents) from public.operations_material_logs ml where ml.tenant_id = j.tenant_id and ml.service_job_id = j.id and ml.status <> 'rejected'), 0) as material_log_cents,
        coalesce((select sum(amount_cents) from public.operations_worker_payments wp where wp.tenant_id = j.tenant_id and wp.service_job_id = j.id and wp.status in ('recorded', 'reviewed')), 0) as people_paid_cents,
        coalesce((select sum(total_cents) from public.service_invoices i where i.tenant_id = j.tenant_id and i.job_id = j.id and i.status <> 'void'), 0) as invoice_total_cents,
        coalesce((select sum(amount_paid_cents) from public.service_invoices i where i.tenant_id = j.tenant_id and i.job_id = j.id and i.status <> 'void'), 0) as invoice_paid_cents,
        coalesce((select count(*) from public.service_invoices i where i.tenant_id = j.tenant_id and i.job_id = j.id and i.status = 'overdue' and i.total_cents > i.amount_paid_cents), 0) as overdue_invoice_count,
        coalesce((select count(*) from public.operations_expenses x where x.tenant_id = j.tenant_id and x.service_job_id = j.id and x.status = 'needs_review'), 0) as unreviewed_expense_count,
        coalesce((select count(*) from public.estimate_warnings w where w.tenant_id = j.tenant_id and w.estimate_id = j.estimate_id and w.status = 'open' and w.severity = 'blocking'), 0) as blocking_warning_count,
        coalesce((select count(*) from public.estimate_warnings w where w.tenant_id = j.tenant_id and w.estimate_id = j.estimate_id and w.status = 'open' and w.severity <> 'blocking'), 0) as open_warning_count,
        coalesce((select count(*) from public.operations_assignments a where a.tenant_id = j.tenant_id and a.service_job_id = j.id and a.status = 'blocked'), 0) as blocked_assignment_count,
        coalesce((select count(*) from public.operations_assignments a where a.tenant_id = j.tenant_id and a.service_job_id = j.id and a.status = 'missed'), 0) as missed_assignment_count,
        coalesce((select count(*) from public.purchase_orders po where po.tenant_id = j.tenant_id and po.service_job_id = j.id and po.required_date < current_date and po.status in ('draft', 'approved', 'ordered', 'picked_up')), 0) as overdue_purchase_order_count,
        coalesce((select sum(total_cents) from public.purchase_orders po where po.tenant_id = j.tenant_id and po.service_job_id = j.id and po.status in ('approved', 'ordered', 'picked_up', 'delivered')), 0) as committed_purchase_order_cents
      from public.service_jobs j
      join public.customers c on c.id = j.customer_id
      left join public.service_estimates e on e.id = j.estimate_id and e.tenant_id = j.tenant_id
      where j.tenant_id = $1
        and j.status not in ('canceled', 'lost')
      order by
        case j.status when 'in_progress' then 1 when 'scheduled' then 2 when 'unscheduled' then 3 when 'completed' then 4 else 5 end,
        coalesce(j.scheduled_start, j.updated_at) desc
      limit 60
      `,
      [tenantId]
    ),
    queryPostgres<DailyLogRow>(
      `
      select l.id, l.service_job_id, j.title as job_title, l.log_date, l.summary,
        l.status, l.confidence, l.risk_flags_json, l.suggested_actions_json, l.created_at
      from public.construction_daily_logs l
      join public.service_jobs j on j.id = l.service_job_id and j.tenant_id = l.tenant_id
      where l.tenant_id = $1 and l.status not in ('rejected', 'archived')
      order by l.log_date desc, l.created_at desc
      limit 40
      `,
      [tenantId]
    )
  ]);

  const flagsByJob = new Map<string, ConstructionDailyRiskFlag[]>();
  for (const log of logsResult?.rows ?? []) {
    const existing = flagsByJob.get(log.service_job_id) ?? [];
    flagsByJob.set(log.service_job_id, [...existing, ...riskFlags(log.risk_flags_json)].slice(0, 8));
  }

  const jobs = (jobsResult?.rows ?? []).map((row) => assessConstructionJobHealth({
    id: row.id,
    title: row.title,
    customerName: row.customer_name,
    status: row.status,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    estimateId: row.estimate_id,
    estimateTotalCents: Number(row.estimate_total_cents ?? 0),
    approvedChangeCents: Number(row.approved_change_cents ?? 0),
    pendingChangeCount: Number(row.pending_change_count ?? 0),
    expenseCents: Number(row.expense_cents ?? 0),
    materialActualCents: Number(row.material_actual_cents ?? 0),
    materialLogCents: Number(row.material_log_cents ?? 0),
    peoplePaidCents: Number(row.people_paid_cents ?? 0),
    invoiceTotalCents: Number(row.invoice_total_cents ?? 0),
    invoicePaidCents: Number(row.invoice_paid_cents ?? 0),
    overdueInvoiceCount: Number(row.overdue_invoice_count ?? 0),
    unreviewedExpenseCount: Number(row.unreviewed_expense_count ?? 0),
    blockingWarningCount: Number(row.blocking_warning_count ?? 0),
    openWarningCount: Number(row.open_warning_count ?? 0),
    blockedAssignmentCount: Number(row.blocked_assignment_count ?? 0),
    missedAssignmentCount: Number(row.missed_assignment_count ?? 0),
    overduePurchaseOrderCount: Number(row.overdue_purchase_order_count ?? 0),
    committedPurchaseOrderCents: Number(row.committed_purchase_order_cents ?? 0),
    recentDailyFlags: flagsByJob.get(row.id) ?? []
  })).sort((left, right) =>
    severityRank[right.severity] - severityRank[left.severity]
    || left.title.localeCompare(right.title)
  );

  return {
    jobs,
    recentLogs: (logsResult?.rows ?? []).map((log) => ({
      id: log.id,
      jobId: log.service_job_id,
      jobTitle: log.job_title,
      date: log.log_date,
      summary: log.summary,
      status: log.status,
      confidence: log.confidence,
      riskFlags: riskFlags(log.risk_flags_json),
      suggestedActions: Array.isArray(log.suggested_actions_json) ? log.suggested_actions_json.map(String) : []
    })),
    metrics: {
      activeJobs: jobs.filter((job) => !["completed"].includes(job.jobStatus)).length,
      highRisk: jobs.filter((job) => ["high", "critical"].includes(job.severity)).length,
      moneyRisk: jobs.filter((job) => job.healthStatus === "money_risk").length,
      scheduleRisk: jobs.filter((job) => job.healthStatus === "schedule_risk").length,
      needsInformation: jobs.filter((job) => job.healthStatus === "needs_information").length,
      fieldLogsToReview: (logsResult?.rows ?? []).filter((log) => log.status === "needs_review").length
    }
  };
}

export async function getConstructionJobHealthDashboard() {
  return getConstructionJobHealthDashboardForTenant(await getCurrentWorkspaceId());
}

export async function saveConstructionHealthSnapshots(tenantId: string, jobs: ConstructionJobHealth[]) {
  for (const job of jobs) {
    await queryPostgres(
      `
      insert into public.construction_job_health_snapshots (
        tenant_id, service_job_id, health_status, severity, project_value_cents,
        tracked_cost_cents, invoiced_cents, paid_cents, open_risk_count,
        risk_items_json, evidence_json, metadata_json
      )
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb
      where not exists (
        select 1
        from public.construction_job_health_snapshots previous
        where previous.tenant_id = $1
          and previous.service_job_id = $2
          and previous.health_status = $3
          and previous.severity = $4
          and previous.project_value_cents = $5
          and previous.tracked_cost_cents = $6
          and previous.invoiced_cents = $7
          and previous.paid_cents = $8
          and previous.open_risk_count = $9
          and previous.calculated_at >= now() - interval '6 hours'
      )
      `,
      [
        tenantId,
        job.id,
        job.healthStatus,
        job.severity,
        job.projectValueCents,
        job.trackedCostCents,
        job.invoicedCents,
        job.paidCents,
        job.risks.length,
        JSON.stringify(job.risks),
        JSON.stringify(job.evidence),
        JSON.stringify({ calculatedBy: "construction_job_health", committedCostCents: job.committedCostCents })
      ]
    );
  }
}

export async function syncConstructionHealthForTenant(tenantId: string) {
  const dashboard = await getConstructionJobHealthDashboardForTenant(tenantId);
  await saveConstructionHealthSnapshots(tenantId, dashboard.jobs);

  const riskyJobs = dashboard.jobs.filter((job) => job.severity === "high" || job.severity === "critical");
  for (const job of riskyJobs) {
    const primaryRisk = job.risks[0];
    await queryPostgres(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, money_cents, risk_type, confidence_score, metadata_json
      )
      values (
        $1, 'ferocity', 'Ferocity', $2, 'construction.job_risk', $3, $4,
        $5, 'needs_owner', true, false, $4, $6,
        '/app/job-tracker/health', $7, $8, 90, $9::jsonb
      )
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null
      do update set
        title = excluded.title,
        summary = excluded.summary,
        severity = excluded.severity,
        status = case when public.owner_command_events.status = 'resolved' then 'resolved' else 'needs_owner' end,
        owner_attention = case when public.owner_command_events.status = 'resolved' then false else true end,
        recommended_action = excluded.recommended_action,
        money_cents = excluded.money_cents,
        risk_type = excluded.risk_type,
        metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
        occurred_at = now(),
        updated_at = now()
      `,
      [
        tenantId,
        `construction-risk:${job.id}`,
        `${job.title} has ${job.severity} project risk`,
        primaryRisk?.explanation ?? `${job.risks.length} project risk signals need attention.`,
        job.severity,
        primaryRisk?.recommendation ?? "Open Job Health, verify the evidence, and assign the next corrective action.",
        Math.max(job.projectValueCents - job.paidCents, 0),
        job.healthStatus === "money_risk" ? "financial" : job.healthStatus === "safety_risk" ? "safety" : "automation",
        JSON.stringify({
          jobId: job.id,
          healthStatus: job.healthStatus,
          openRiskCount: job.risks.length,
          riskItems: job.risks,
          calculatedBy: "construction_job_health_automation"
        })
      ]
    );
  }

  await queryPostgres(
    `
    update public.owner_command_events event
    set status = 'resolved',
        owner_attention = false,
        ai_handled = true,
        ai_summary = 'Ferocity recalculated the job and the high-risk condition is no longer present.',
        updated_at = now()
    where event.tenant_id = $1
      and event.event_type = 'construction.job_risk'
      and event.status <> 'resolved'
      and not exists (
        select 1
        from unnest($2::uuid[]) active(job_id)
        where event.external_event_id = 'construction-risk:' || active.job_id::text
      )
    `,
    [tenantId, riskyJobs.map((job) => job.id)]
  );

  return {
    jobsChecked: dashboard.jobs.length,
    highRiskJobs: riskyJobs.length,
    fieldLogsToReview: dashboard.metrics.fieldLogsToReview
  };
}
