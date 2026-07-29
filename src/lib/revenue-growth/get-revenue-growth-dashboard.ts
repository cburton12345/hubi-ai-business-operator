import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type RevenueGrowthDashboard = {
  metrics: {
    adSpendCents: number;
    leads: number;
    costPerLeadCents: number | null;
    qualifiedLeads: number;
    costPerQualifiedLeadCents: number | null;
    bookedAppointments: number;
    costPerBookedAppointmentCents: number | null;
    showedAppointments: number;
    showRate: number | null;
    noShowRate: number | null;
    estimatesSent: number;
    closeRate: number | null;
    averageSaleCents: number;
    totalSalesCents: number;
    collectedRevenueCents: number;
    outstandingRevenueCents: number;
    grossProfitCents: number;
    roas: number | null;
    customerAcquisitionCostCents: number | null;
    paybackPeriodDays: number | null;
    moneyAtRiskCents: number;
  };
  stages: {
    key: string;
    label: string;
    value: string;
    detail: string;
    href: string;
  }[];
  sourceRows: RevenueBreakdownRow[];
  salespersonRows: RevenueBreakdownRow[];
  serviceRows: RevenueBreakdownRow[];
  locationRows: RevenueBreakdownRow[];
  recommendations: RevenueRecommendationRow[];
  scoredLeads: {
    id: string;
    leadId: string;
    name: string;
    status: string;
    score: number;
    urgency: number;
    estimatedValueCents: number;
    nextAction: string;
    reason: string | null;
  }[];
  followups: {
    id: string;
    title: string;
    detail: string;
    status: string;
    dueAt: string | null;
  }[];
  goals: {
    id: string;
    name: string;
    targetCollectedRevenueCents: number;
    targetProfitCents: number;
    targetAverageSaleCents: number;
    targetCloseRateBps: number;
    targetShowRateBps: number;
    neededLeads: number;
    neededQualifiedLeads: number;
    neededAppointments: number;
    neededShowedAppointments: number;
    neededSales: number;
    periodLabel: string;
  }[];
  conversionQueue: {
    id: string;
    eventType: string;
    provider: string;
    status: string;
    consentChecked: boolean;
    createdAt: string;
  }[];
  qualificationForms: {
    id: string;
    name: string;
    serviceLabel: string | null;
    status: string;
    questionCount: number;
    publicFormPath: string | null;
  }[];
  followupSequences: {
    id: string;
    name: string;
    triggerType: string;
    status: string;
    approvalRequired: boolean;
    stepCount: number;
  }[];
  appointmentReminders: {
    id: string;
    label: string;
    contact: string;
    channel: string;
    status: string;
    scheduledFor: string | null;
  }[];
};

export type RevenueBreakdownRow = {
  label: string;
  leads: number;
  qualified: number;
  appointments: number;
  sales: number;
  collectedRevenueCents: number;
  grossProfitCents: number;
  spendCents: number;
  roas: string;
};

export type RevenueRecommendationRow = {
  id: string;
  problem: string;
  supportingData: string;
  estimatedRevenueImpactCents: number;
  recommendedAction: string;
  confidenceLevel: string;
  priority: string;
  status: string;
  actionHref: string | null;
};

function num(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function centsPer(costCents: number, count: number) {
  if (count <= 0) return null;
  return Math.round(costCents / count);
}

function percentValue(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

function moneyLabel(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function numberLabel(value: number) {
  return value.toLocaleString();
}

function roasLabel(revenueCents: number, spendCents: number) {
  if (spendCents <= 0) return revenueCents > 0 ? "no spend tracked" : "not tracked";
  return `${(revenueCents / spendCents).toFixed(1)}x`;
}

function periodLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function forecastGoal(goal: {
  target_collected_revenue_cents: number;
  target_average_sale_cents: number;
  target_close_rate_bps: number;
  target_show_rate_bps: number;
  target_qualified_leads: number;
  target_leads: number;
  target_appointments: number;
}) {
  const averageSale = Math.max(1, goal.target_average_sale_cents || 250000);
  const closeRate = Math.max(1, goal.target_close_rate_bps || 3000) / 10000;
  const showRate = Math.max(1, goal.target_show_rate_bps || 7000) / 10000;
  const qualifiedRate = 0.55;
  const appointmentRate = 0.7;
  const neededSales = Math.ceil(goal.target_collected_revenue_cents / averageSale);
  const neededShowedAppointments = Math.ceil(neededSales / closeRate);
  const neededAppointments = Math.max(goal.target_appointments, Math.ceil(neededShowedAppointments / showRate));
  const neededQualifiedLeads = Math.max(goal.target_qualified_leads, Math.ceil(neededAppointments / appointmentRate));
  const neededLeads = Math.max(goal.target_leads, Math.ceil(neededQualifiedLeads / qualifiedRate));
  return { neededSales, neededShowedAppointments, neededAppointments, neededQualifiedLeads, neededLeads };
}

export async function getRevenueGrowthDashboard(): Promise<RevenueGrowthDashboard> {
  const workspaceId = await getCurrentWorkspaceId();

  const [
    metricsResult,
    sourceResult,
    salespersonResult,
    serviceResult,
    locationResult,
    recommendationResult,
    scoredLeadResult,
    followupResult,
    goalResult,
    queueResult,
    formResult,
    sequenceResult,
    reminderResult
  ] = await Promise.all([
    queryPostgres<{
      ad_spend_cents: string;
      leads: string;
      qualified_leads: string;
      booked_appointments: string;
      showed_appointments: string;
      no_show_appointments: string;
      estimates_sent: string;
      estimates_sent_cents: string;
      signed_sales: string;
      signed_sales_cents: string;
      collected_revenue_cents: string;
      outstanding_revenue_cents: string;
      material_cost_cents: string;
      worker_cost_cents: string;
    }>(
      `
      select
        coalesce((select sum(metric_value)::bigint from public.external_metric_snapshots where tenant_id = $1 and metric_key in ('spend_cents','cost_cents') and period_start >= current_date - interval '90 days'), 0)::text as ad_spend_cents,
        (select count(*) from public.leads where tenant_id = $1 and status <> 'spam' and created_at >= now() - interval '90 days')::text as leads,
        (select count(*) from public.leads l left join public.revenue_lead_scores s on s.tenant_id = l.tenant_id and s.lead_id = l.id where l.tenant_id = $1 and l.status <> 'spam' and l.created_at >= now() - interval '90 days' and (l.qualification_status = 'qualified' or s.qualification_status = 'qualified'))::text as qualified_leads,
        ((select count(*) from public.revenue_appointments where tenant_id = $1 and status in ('booked','confirmed','showed','completed') and coalesce(scheduled_start, created_at) >= now() - interval '90 days')
          + (
            select count(*)
            from public.service_jobs j
            where j.tenant_id = $1
              and j.status in ('scheduled','in_progress','completed')
              and j.scheduled_start >= now() - interval '90 days'
              and not exists (
                select 1 from public.revenue_appointments a
                where a.tenant_id = j.tenant_id and a.service_job_id = j.id
              )
          ))::text as booked_appointments,
        ((select count(*) from public.revenue_appointments where tenant_id = $1 and status in ('showed','completed') and coalesce(showed_at, scheduled_start, created_at) >= now() - interval '90 days')
          + (
            select count(*)
            from public.service_jobs j
            where j.tenant_id = $1
              and j.status in ('in_progress','completed')
              and j.scheduled_start >= now() - interval '90 days'
              and not exists (
                select 1 from public.revenue_appointments a
                where a.tenant_id = j.tenant_id and a.service_job_id = j.id
              )
          ))::text as showed_appointments,
        (select count(*) from public.revenue_appointments where tenant_id = $1 and status = 'no_show' and created_at >= now() - interval '90 days')::text as no_show_appointments,
        (select count(*) from public.service_estimates where tenant_id = $1 and status in ('sent_manually','approved','declined') and created_at >= now() - interval '90 days')::text as estimates_sent,
        coalesce((select sum(total_cents) from public.service_estimates where tenant_id = $1 and status in ('sent_manually','approved','declined') and created_at >= now() - interval '90 days'), 0)::text as estimates_sent_cents,
        (select count(*) from public.service_estimates where tenant_id = $1 and status = 'approved' and created_at >= now() - interval '90 days')::text as signed_sales,
        coalesce((select sum(total_cents) from public.service_estimates where tenant_id = $1 and status = 'approved' and created_at >= now() - interval '90 days'), 0)::text as signed_sales_cents,
        coalesce((select sum(amount_cents) from public.service_invoice_payments where tenant_id = $1 and status in ('succeeded','manual') and received_at >= now() - interval '90 days'), 0)::text as collected_revenue_cents,
        coalesce((select sum(greatest(total_cents - amount_paid_cents, 0)) from public.service_invoices where tenant_id = $1 and status in ('sent_manually','partially_paid','overdue') and created_at >= now() - interval '90 days'), 0)::text as outstanding_revenue_cents,
        coalesce((select sum(coalesce(nullif(actual_cost_cents, 0), estimated_cost_cents)) from public.job_material_list_items where tenant_id = $1 and status <> 'cancelled' and created_at >= now() - interval '90 days'), 0)::text as material_cost_cents,
        coalesce((select sum(amount_cents) from public.operations_worker_payments where tenant_id = $1 and status in ('recorded','reviewed') and payment_date >= current_date - interval '90 days'), 0)::text as worker_cost_cents
      `,
      [workspaceId]
    ),
    breakdownQuery(workspaceId, "source"),
    breakdownQuery(workspaceId, "salesperson"),
    breakdownQuery(workspaceId, "service"),
    breakdownQuery(workspaceId, "location"),
    queryPostgres<{
      id: string;
      problem: string;
      supporting_data: string;
      estimated_revenue_impact_cents: number;
      recommended_action: string;
      confidence_level: string;
      priority: string;
      status: string;
      action_href: string | null;
    }>(
      `
      select id, problem, supporting_data, estimated_revenue_impact_cents, recommended_action,
        confidence_level, priority, status, action_href
      from public.revenue_recommendations
      where tenant_id = $1 and status <> 'archived'
      order by
        case priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
        estimated_revenue_impact_cents desc,
        created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      lead_id: string;
      name: string | null;
      qualification_status: string;
      qualification_score: number;
      urgency_score: number;
      estimated_value_cents: number;
      recommended_next_action: string;
      qualification_reason: string | null;
    }>(
      `
      select s.id, s.lead_id, l.name, s.qualification_status, s.qualification_score, s.urgency_score,
        s.estimated_value_cents, s.recommended_next_action, s.qualification_reason
      from public.revenue_lead_scores s
      join public.leads l on l.tenant_id = s.tenant_id and l.id = s.lead_id
      where s.tenant_id = $1
      order by s.urgency_score desc, s.qualification_score desc, s.last_scored_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      workflow_type: string;
      status: string;
      due_at: Date | null;
      ai_suggested_message: string | null;
      lead_name: string | null;
      estimate_title: string | null;
    }>(
      `
      select f.id, f.workflow_type, f.status, f.due_at, f.ai_suggested_message,
        l.name as lead_name, e.title as estimate_title
      from public.follow_up_workflows f
      left join public.leads l on l.tenant_id = f.tenant_id and l.id = f.lead_id
      left join public.service_estimates e on e.tenant_id = f.tenant_id and e.id = f.estimate_id
      where f.tenant_id = $1 and f.status in ('open','scheduled')
      order by f.due_at nulls first, f.created_at desc
      limit 10
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      goal_name: string;
      period_start: Date;
      period_end: Date;
      target_collected_revenue_cents: number;
      target_profit_cents: number;
      target_leads: number;
      target_qualified_leads: number;
      target_appointments: number;
      target_show_rate_bps: number;
      target_close_rate_bps: number;
      target_average_sale_cents: number;
    }>(
      `
      select id, goal_name, period_start, period_end, target_collected_revenue_cents, target_profit_cents,
        target_leads, target_qualified_leads, target_appointments, target_show_rate_bps, target_close_rate_bps,
        target_average_sale_cents
      from public.revenue_goals
      where tenant_id = $1 and status = 'active'
      order by period_start desc
      limit 5
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      event_type: string;
      provider: string;
      status: string;
      consent_checked: boolean;
      created_at: Date;
    }>(
      `
      select id, event_type, provider, status, consent_checked, created_at
      from public.revenue_conversion_event_queue
      where tenant_id = $1
      order by created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      service_label: string | null;
      status: string;
      question_count: string;
      public_form_key: string | null;
    }>(
      `
      select f.id, f.name, f.service_label, f.status,
        f.metadata_json->>'publicFormKey' as public_form_key,
        count(q.id)::text as question_count
      from public.revenue_qualification_forms f
      left join public.revenue_qualification_questions q on q.tenant_id = f.tenant_id and q.form_id = f.id
      where f.tenant_id = $1 and f.status <> 'archived'
      group by f.id
      order by f.created_at desc
      limit 6
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      name: string;
      trigger_type: string;
      status: string;
      approval_required: boolean;
      step_count: string;
    }>(
      `
      select s.id, s.name, s.trigger_type, s.status, s.approval_required, count(st.id)::text as step_count
      from public.revenue_followup_sequences s
      left join public.revenue_followup_steps st on st.tenant_id = s.tenant_id and st.sequence_id = s.id
      where s.tenant_id = $1 and s.status <> 'archived'
      group by s.id
      order by s.created_at desc
      limit 6
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      action_label: string | null;
      contact: string | null;
      channel: string;
      status: string;
      scheduled_for: Date | null;
    }>(
      `
      select
        r.id,
        r.metadata_json->>'actionLabel' as action_label,
        case when r.channel = 'sms' then coalesce(l.phone, c.phone) else coalesce(l.email, c.email) end as contact,
        r.channel,
        r.status,
        r.scheduled_for
      from public.revenue_appointment_reminders r
      join public.revenue_appointments a on a.tenant_id = r.tenant_id and a.id = r.appointment_id
      left join public.leads l on l.tenant_id = a.tenant_id and l.id = a.lead_id
      left join public.customers c on c.tenant_id = a.tenant_id and c.id = a.customer_id
      where r.tenant_id = $1
        and r.status not in ('canceled', 'skipped')
      order by r.scheduled_for asc nulls last, r.created_at desc
      limit 12
      `,
      [workspaceId]
    )
  ]);

  const raw = metricsResult?.rows[0];
  const adSpendCents = num(raw?.ad_spend_cents);
  const leads = num(raw?.leads);
  const qualifiedLeads = num(raw?.qualified_leads);
  const bookedAppointments = num(raw?.booked_appointments);
  const showedAppointments = num(raw?.showed_appointments);
  const noShowAppointments = num(raw?.no_show_appointments);
  const estimatesSent = num(raw?.estimates_sent);
  const signedSales = num(raw?.signed_sales);
  const totalSalesCents = num(raw?.signed_sales_cents);
  const collectedRevenueCents = num(raw?.collected_revenue_cents);
  const outstandingRevenueCents = num(raw?.outstanding_revenue_cents);
  const totalCostCents = num(raw?.material_cost_cents) + num(raw?.worker_cost_cents);
  const grossProfitCents = collectedRevenueCents - totalCostCents;
  const moneyAtRiskCents = outstandingRevenueCents + num(raw?.estimates_sent_cents) - totalSalesCents;
  const showDenominator = bookedAppointments + noShowAppointments;

  const metrics = {
    adSpendCents,
    leads,
    costPerLeadCents: centsPer(adSpendCents, leads),
    qualifiedLeads,
    costPerQualifiedLeadCents: centsPer(adSpendCents, qualifiedLeads),
    bookedAppointments,
    costPerBookedAppointmentCents: centsPer(adSpendCents, bookedAppointments),
    showedAppointments,
    showRate: percentValue(showedAppointments, showDenominator),
    noShowRate: percentValue(noShowAppointments, showDenominator),
    estimatesSent,
    closeRate: percentValue(signedSales, estimatesSent),
    averageSaleCents: signedSales > 0 ? Math.round(totalSalesCents / signedSales) : 0,
    totalSalesCents,
    collectedRevenueCents,
    outstandingRevenueCents,
    grossProfitCents,
    roas: ratio(collectedRevenueCents, adSpendCents),
    customerAcquisitionCostCents: centsPer(adSpendCents, signedSales),
    paybackPeriodDays: collectedRevenueCents > 0 && adSpendCents > 0 ? Math.max(1, Math.round((adSpendCents / collectedRevenueCents) * 90)) : null,
    moneyAtRiskCents: Math.max(0, moneyAtRiskCents)
  };

  return {
    metrics,
    stages: [
      { key: "traffic", label: "Traffic", value: adSpendCents > 0 ? moneyLabel(adSpendCents) : "Connect spend", detail: "Tracked ad or campaign spend", href: "/app/marketing-os" },
      { key: "lead", label: "Leads", value: numberLabel(leads), detail: `${moneyOrDash(metrics.costPerLeadCents)} cost per lead`, href: "/app/leads" },
      { key: "qualified", label: "Qualified", value: numberLabel(qualifiedLeads), detail: `${moneyOrDash(metrics.costPerQualifiedLeadCents)} cost per qualified lead`, href: "/app/revenue-growth#qualified-leads" },
      { key: "booked", label: "Booked", value: numberLabel(bookedAppointments), detail: `${moneyOrDash(metrics.costPerBookedAppointmentCents)} cost per booked appointment`, href: "/app/calendar" },
      { key: "showed", label: "Showed", value: `${metrics.showRate ?? 0}%`, detail: `${numberLabel(showedAppointments)} showed / ${metrics.noShowRate ?? 0}% no-show`, href: "/app/revenue-growth#appointments" },
      { key: "estimate", label: "Estimate", value: numberLabel(estimatesSent), detail: "Proposals sent or decided", href: "/app/service" },
      { key: "sold", label: "Sold", value: moneyLabel(totalSalesCents), detail: `${metrics.closeRate ?? 0}% close rate`, href: "/app/service" },
      { key: "paid", label: "Paid", value: moneyLabel(collectedRevenueCents), detail: `${moneyLabel(outstandingRevenueCents)} still outstanding`, href: "/app/cash-collection" },
      { key: "review", label: "Review", value: "Next", detail: "Paid/completed customers should feed proof and reviews", href: "/app/proof" },
      { key: "repeat", label: "Repeat", value: "Nurture", detail: "Past customers and not-yet prospects feed the next demand cycle", href: "/app/marketing-os" }
    ],
    sourceRows: sourceResult?.rows.map(mapBreakdownRow) ?? [],
    salespersonRows: salespersonResult?.rows.map(mapBreakdownRow) ?? [],
    serviceRows: serviceResult?.rows.map(mapBreakdownRow) ?? [],
    locationRows: locationResult?.rows.map(mapBreakdownRow) ?? [],
    recommendations: (recommendationResult?.rows ?? []).map((row) => ({
      id: row.id,
      problem: row.problem,
      supportingData: row.supporting_data,
      estimatedRevenueImpactCents: row.estimated_revenue_impact_cents,
      recommendedAction: row.recommended_action,
      confidenceLevel: row.confidence_level,
      priority: row.priority,
      status: row.status,
      actionHref: row.action_href
    })),
    scoredLeads: (scoredLeadResult?.rows ?? []).map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      name: row.name ?? "Unnamed lead",
      status: row.qualification_status,
      score: row.qualification_score,
      urgency: row.urgency_score,
      estimatedValueCents: row.estimated_value_cents,
      nextAction: row.recommended_next_action,
      reason: row.qualification_reason
    })),
    followups: (followupResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.workflow_type.replaceAll("_", " "),
      detail: row.ai_suggested_message ?? row.estimate_title ?? row.lead_name ?? "Review the next follow-up step.",
      status: row.status,
      dueAt: row.due_at ? new Date(row.due_at).toISOString() : null
    })),
    goals: (goalResult?.rows ?? []).map((goal) => {
      const forecast = forecastGoal(goal);
      return {
        id: goal.id,
        name: goal.goal_name,
        targetCollectedRevenueCents: goal.target_collected_revenue_cents,
        targetProfitCents: goal.target_profit_cents,
        targetAverageSaleCents: goal.target_average_sale_cents,
        targetCloseRateBps: goal.target_close_rate_bps,
        targetShowRateBps: goal.target_show_rate_bps,
        periodLabel: periodLabel(goal.period_start, goal.period_end),
        ...forecast
      };
    }),
    conversionQueue: (queueResult?.rows ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      provider: row.provider,
      status: row.status,
      consentChecked: row.consent_checked,
      createdAt: new Date(row.created_at).toISOString()
    })),
    qualificationForms: (formResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      serviceLabel: row.service_label,
      status: row.status,
      questionCount: num(row.question_count),
      publicFormPath: row.public_form_key ? `/forms/${row.public_form_key}` : null
    })),
    followupSequences: (sequenceResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      triggerType: row.trigger_type,
      status: row.status,
      approvalRequired: row.approval_required,
      stepCount: num(row.step_count)
    })),
    appointmentReminders: (reminderResult?.rows ?? []).map((row) => ({
      id: row.id,
      label: row.action_label ?? "Appointment reminder",
      contact: row.contact ?? "No reachable contact",
      channel: row.channel,
      status: row.status,
      scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null
    }))
  };
}

function moneyOrDash(cents: number | null) {
  return cents === null ? "not tracked" : moneyLabel(cents);
}

function mapBreakdownRow(row: {
  label: string | null;
  leads: string;
  qualified: string;
  appointments: string;
  sales: string;
  collected_revenue_cents: string;
  gross_profit_cents: string;
  spend_cents: string;
}): RevenueBreakdownRow {
  const collectedRevenueCents = num(row.collected_revenue_cents);
  const spendCents = num(row.spend_cents);
  return {
    label: row.label || "Unknown",
    leads: num(row.leads),
    qualified: num(row.qualified),
    appointments: num(row.appointments),
    sales: num(row.sales),
    collectedRevenueCents,
    grossProfitCents: num(row.gross_profit_cents),
    spendCents,
    roas: roasLabel(collectedRevenueCents, spendCents)
  };
}

function breakdownQuery(workspaceId: string, mode: "source" | "salesperson" | "service" | "location") {
  const labelSql = {
    source: "coalesce(nullif(l.source, ''), nullif(ar.original_source, ''), 'Unknown source')",
    salesperson: "coalesce(u.name, u.email, 'Unassigned')",
    service: "coalesce(nullif(ls.service_interest, ''), nullif(j.title, ''), nullif(e.title, ''), 'Unknown service')",
    location: "coalesce(nullif(ls.location, ''), nullif(j.service_area, ''), nullif(j.service_address, ''), 'Unknown location')"
  }[mode];

  const spendJoin = mode === "source"
    ? `
      left join (
        select
          case
            when metric_family = 'ads' then 'paid'
            when metric_family = 'seo' then 'organic'
            when metric_family = 'reviews' then 'gbp'
            else metric_family
          end as label,
          sum(metric_value)::bigint as spend_cents
        from public.external_metric_snapshots
        where tenant_id = $1 and metric_key in ('spend_cents','cost_cents') and period_start >= current_date - interval '90 days'
        group by 1
      ) spend on spend.label = lower(coalesce(nullif(l.source, ''), nullif(ar.original_source, ''), 'unknown source'))
    `
    : "";

  return queryPostgres<{
    label: string | null;
    leads: string;
    qualified: string;
    appointments: string;
    sales: string;
    collected_revenue_cents: string;
    gross_profit_cents: string;
    spend_cents: string;
  }>(
    `
    with base as (
      select
        ${labelSql} as label,
        l.id as lead_id,
        l.qualification_status,
        s.qualification_status as scored_status,
        ra.id as appointment_id,
        e.id as estimate_id,
        p.id as payment_id,
        coalesce(p.amount_cents, 0) as collected_cents,
        coalesce(mat.material_cents, 0) + coalesce(pay.worker_cents, 0) as cost_cents,
        ${mode === "source" ? "coalesce(spend.spend_cents, 0)" : "0"} as spend_cents
      from public.leads l
      left join public.revenue_lead_scores s on s.tenant_id = l.tenant_id and s.lead_id = l.id
      left join public.local_service_lead_details ls on ls.tenant_id = l.tenant_id and ls.lead_id = l.id
      left join public.revenue_attribution_records ar on ar.tenant_id = l.tenant_id and ar.lead_id = l.id and ar.entity_type = 'lead'
      left join public.revenue_appointments ra on ra.tenant_id = l.tenant_id and ra.lead_id = l.id and ra.status in ('booked','confirmed','showed','completed')
      left join public.service_estimates e on e.tenant_id = l.tenant_id and e.source_lead_id = l.id and e.status = 'approved'
      left join public.service_jobs j on j.tenant_id = l.tenant_id and j.source_lead_id = l.id
      left join public.service_invoices i on i.tenant_id = l.tenant_id and (i.estimate_id = e.id or i.job_id = j.id)
      left join public.service_invoice_payments p on p.tenant_id = l.tenant_id and p.invoice_id = i.id and p.status in ('succeeded','manual')
      left join public.users u on u.id = coalesce(l.assigned_to_user_id, j.assigned_user_id)
      left join (
        select tenant_id, service_job_id, sum(coalesce(nullif(actual_cost_cents, 0), estimated_cost_cents)) as material_cents
        from public.job_material_list_items
        where status <> 'cancelled'
        group by tenant_id, service_job_id
      ) mat on mat.tenant_id = j.tenant_id and mat.service_job_id = j.id
      left join (
        select tenant_id, service_job_id, sum(amount_cents) as worker_cents
        from public.operations_worker_payments
        where status in ('recorded','reviewed')
        group by tenant_id, service_job_id
      ) pay on pay.tenant_id = j.tenant_id and pay.service_job_id = j.id
      ${spendJoin}
      where l.tenant_id = $1 and l.status <> 'spam' and l.created_at >= now() - interval '90 days'
    )
    select
      label,
      count(distinct lead_id)::text as leads,
      count(distinct lead_id) filter (where qualification_status = 'qualified' or scored_status = 'qualified')::text as qualified,
      count(distinct appointment_id)::text as appointments,
      count(distinct estimate_id)::text as sales,
      coalesce(sum(collected_cents), 0)::text as collected_revenue_cents,
      (coalesce(sum(collected_cents), 0) - coalesce(sum(cost_cents), 0))::text as gross_profit_cents,
      coalesce(max(spend_cents), 0)::text as spend_cents
    from base
    group by label
    order by coalesce(sum(collected_cents), 0) desc, count(distinct lead_id) desc
    limit 12
    `,
    [workspaceId]
  );
}
