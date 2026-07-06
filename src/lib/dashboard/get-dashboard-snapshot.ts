import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { internalBrands, starterRecommendations, starterTasks } from "@/lib/dashboard/demo-data";
import type { BrandSummary } from "@/types/core";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

type BrandRow = {
  name: string;
  slug: string;
  business_model: BrandSummary["businessModel"];
  industry: string | null;
  primary_goal: string | null;
  risk_profile: BrandSummary["riskProfile"];
};

type BreakdownRow = {
  label: string;
  count: string;
};

type OperationalCountsRow = {
  followups_due: string;
  action_queue: string;
  unpaid_invoices: string;
  overdue_invoices: string;
  labor_open_requests: string;
  labor_available_workers: string;
  labor_match_approvals: string;
  payments_collected_cents: string;
  invoice_balance_cents: string;
  pipeline_value_cents: string;
  visitors: string;
  ad_spend_cents: string;
};

type FollowUpRow = {
  id: string;
  contact_name: string | null;
  workflow_type: string;
  due_at: string | null;
  channel: string;
  ai_suggested_message: string | null;
};

type InvoiceFollowUpRow = {
  id: string;
  title: string;
  customer_name: string;
  status: string;
  balance_due_cents: number;
  due_date: string | null;
};

type OwnerSummaryRow = {
  income_today_cents: string;
  income_week_cents: string;
  income_30d_cents: string;
  expenses_today_cents: string;
  expenses_week_cents: string;
  expenses_30d_cents: string;
  job_cost_30d_cents: string;
  overhead_30d_cents: string;
  hours_today: string;
  hours_week: string;
  working_now: string;
  scheduled_today: string;
  open_assignments: string;
  active_workers: string;
  off_workers: string;
  itinerary_needed: string;
  expense_review: string;
  payroll_review: string;
  recurring_expenses: string;
  recurring_due: string;
};

type ItineraryNeedRow = {
  id: string;
  name: string;
  role_type: string;
  trade: string | null;
  availability_status: string;
};

type DailyPriority = {
  id: string;
  title: string;
  detail: string;
  href: string;
  buttonLabel: string;
  urgency: "high" | "medium" | "low";
};

function money(cents: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number(cents ?? 0) / 100
  );
}

async function loadOperationalSnapshot(workspaceId: string) {
  const [countsResult, followUpResult, invoiceResult, ownerSummaryResult, itineraryResult] = await Promise.all([
    queryPostgres<OperationalCountsRow>(
      `
      select
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open', 'missed') and coalesce(due_at, created_at) <= now()) as followups_due,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and status in ('needs_review', 'approved')) as action_queue,
        (select count(*) from public.service_invoices where tenant_id = $1 and status in ('draft', 'sent_manually', 'partially_paid', 'overdue')) as unpaid_invoices,
        (select count(*) from public.labor_staffing_requests where tenant_id = $1 and status in ('open','matching','approval_needed','contacting')) as labor_open_requests,
        (select count(*) from public.labor_worker_availability where tenant_id = $1 and status in ('available','needs_review')) as labor_available_workers,
        (select count(*) from public.labor_staffing_matches where tenant_id = $1 and status = 'suggested') as labor_match_approvals,
        (
          select count(*) from public.service_invoices
          where tenant_id = $1 and status in ('sent_manually', 'partially_paid', 'overdue')
            and coalesce(due_date, created_at::date) <= current_date
            and amount_paid_cents < total_cents
        ) as overdue_invoices,
        (select coalesce(sum(amount_paid_cents), 0) from public.service_invoices where tenant_id = $1 and status in ('partially_paid', 'paid')) as payments_collected_cents,
        (select coalesce(sum(greatest(total_cents - amount_paid_cents, 0)), 0) from public.service_invoices where tenant_id = $1 and status in ('draft', 'sent_manually', 'partially_paid', 'overdue')) as invoice_balance_cents,
        (select coalesce(sum(value_cents), 0) from public.opportunities where tenant_id = $1 and status = 'open') as pipeline_value_cents,
        (
          select coalesce(sum(metric_value), 0)
          from public.external_metric_snapshots
          where tenant_id = $1 and metric_family = 'analytics' and metric_key in ('visitors', 'sessions')
            and period_start >= current_date - interval '30 days'
        ) as visitors,
        (
          select coalesce(sum(metric_value), 0)
          from public.external_metric_snapshots
          where tenant_id = $1 and metric_family = 'ads' and metric_key in ('spend_cents', 'cost_cents')
            and period_start >= current_date - interval '30 days'
        ) as ad_spend_cents
      `,
      [workspaceId]
    ),
    queryPostgres<FollowUpRow>(
      `
      select f.id,
        coalesce(l.name, c.name, i.title, l.email, l.phone, 'Follow-up') as contact_name,
        f.workflow_type, f.due_at, f.channel, f.ai_suggested_message
      from public.follow_up_workflows f
      left join public.leads l on l.id = f.lead_id
      left join public.customers c on c.id = f.customer_id
      left join public.service_invoices i on i.id = f.invoice_id
      where f.tenant_id = $1 and f.status in ('open', 'missed')
      order by coalesce(f.due_at, f.created_at) asc
      limit 6
      `,
      [workspaceId]
    ),
    queryPostgres<InvoiceFollowUpRow>(
      `
      select i.id, i.title, c.name as customer_name, i.status,
        greatest(i.total_cents - i.amount_paid_cents, 0) as balance_due_cents,
        i.due_date::text as due_date
      from public.service_invoices i
      join public.customers c on c.id = i.customer_id
      where i.tenant_id = $1
        and i.status in ('sent_manually', 'partially_paid', 'overdue')
        and i.amount_paid_cents < i.total_cents
      order by coalesce(i.due_date, i.created_at::date) asc
      limit 6
      `,
      [workspaceId]
    ),
    queryPostgres<OwnerSummaryRow>(
      `
      with worker_hours as (
        select
          coalesce(sum(extract(epoch from (coalesce(clock_out_at, now()) - clock_in_at)) / 3600 - (break_minutes::numeric / 60))
            filter (where clock_in_at::date = current_date), 0) as hours_today,
          coalesce(sum(extract(epoch from (coalesce(clock_out_at, now()) - clock_in_at)) / 3600 - (break_minutes::numeric / 60))
            filter (where clock_in_at >= date_trunc('week', now())), 0) as hours_week
        from public.operations_time_entries
        where tenant_id = $1
      ),
      expense_totals as (
        select
          coalesce(sum(amount_cents + tax_cents) filter (where coalesce(expense_date, created_at::date) = current_date and status <> 'rejected'), 0) as expenses_today_cents,
          coalesce(sum(amount_cents + tax_cents) filter (where coalesce(expense_date, created_at::date) >= date_trunc('week', now())::date and status <> 'rejected'), 0) as expenses_week_cents,
          coalesce(sum(amount_cents + tax_cents) filter (where coalesce(expense_date, created_at::date) >= current_date - interval '30 days' and status <> 'rejected'), 0) as expenses_30d_cents,
          coalesce(sum(amount_cents + tax_cents) filter (where coalesce(expense_date, created_at::date) >= current_date - interval '30 days' and status <> 'rejected' and assign_to = 'job'), 0) as job_expense_30d_cents,
          coalesce(sum(amount_cents + tax_cents) filter (where coalesce(expense_date, created_at::date) >= current_date - interval '30 days' and status <> 'rejected' and assign_to = 'overhead'), 0) as overhead_30d_cents
        from public.operations_expenses
        where tenant_id = $1
      ),
      material_totals as (
        select
          coalesce(sum(cost_cents) filter (where created_at >= current_date - interval '30 days' and status <> 'rejected'), 0) as material_30d_cents
        from public.operations_material_logs
        where tenant_id = $1
      ),
      income_totals as (
        select
          coalesce(sum(amount_cents) filter (where coalesce(paid_at, received_at)::date = current_date and status in ('succeeded','manual')), 0) as income_today_cents,
          coalesce(sum(amount_cents) filter (where coalesce(paid_at, received_at) >= date_trunc('week', now()) and status in ('succeeded','manual')), 0) as income_week_cents,
          coalesce(sum(amount_cents) filter (where coalesce(paid_at, received_at) >= now() - interval '30 days' and status in ('succeeded','manual')), 0) as income_30d_cents
        from public.service_invoice_payments
        where tenant_id = $1
      )
      select
        income.income_today_cents::text,
        income.income_week_cents::text,
        income.income_30d_cents::text,
        expenses.expenses_today_cents::text,
        expenses.expenses_week_cents::text,
        expenses.expenses_30d_cents::text,
        (expenses.job_expense_30d_cents + materials.material_30d_cents)::text as job_cost_30d_cents,
        expenses.overhead_30d_cents::text,
        hours.hours_today::text,
        hours.hours_week::text,
        (select count(*) from public.operations_time_entries where tenant_id = $1 and status = 'open')::text as working_now,
        (select count(*) from public.operations_assignments where tenant_id = $1 and scheduled_start::date = current_date and status in ('scheduled','in_progress','blocked'))::text as scheduled_today,
        (select count(*) from public.operations_assignments where tenant_id = $1 and status in ('scheduled','in_progress','blocked','missed'))::text as open_assignments,
        (select count(*) from public.operations_workers where tenant_id = $1 and availability_status <> 'inactive')::text as active_workers,
        (select count(*) from public.operations_workers where tenant_id = $1 and availability_status in ('off','blocked'))::text as off_workers,
        (
          select count(*)
          from public.operations_workers w
          where w.tenant_id = $1
            and w.availability_status in ('available','scheduled')
            and not exists (
              select 1
              from public.operations_assignments a
              where a.tenant_id = w.tenant_id
                and (a.worker_id = w.id or exists (
                  select 1 from public.operations_crew_members cm
                  where cm.tenant_id = w.tenant_id and cm.worker_id = w.id and cm.crew_id = a.crew_id
                ))
                and a.status in ('scheduled','in_progress','blocked')
                and a.scheduled_start::date = current_date
            )
        )::text as itinerary_needed,
        (
          (select count(*) from public.operations_expenses where tenant_id = $1 and status = 'needs_review') +
          (select count(*) from public.operations_mileage_entries where tenant_id = $1 and status = 'needs_review') +
          (select count(*) from public.operations_material_logs where tenant_id = $1 and status = 'needs_review')
        )::text as expense_review,
        (select count(*) from public.operations_payroll_exports where tenant_id = $1 and status in ('draft','ready','failed'))::text as payroll_review,
        (select count(*) from public.recurring_operating_expenses where tenant_id = $1 and status = 'active')::text as recurring_expenses,
        (select count(*) from public.recurring_operating_expenses where tenant_id = $1 and status = 'active' and next_due_date <= current_date + interval '7 days')::text as recurring_due
      from worker_hours hours, expense_totals expenses, material_totals materials, income_totals income
      `,
      [workspaceId]
    ),
    queryPostgres<ItineraryNeedRow>(
      `
      select w.id, w.name, w.role_type, w.trade, w.availability_status
      from public.operations_workers w
      where w.tenant_id = $1
        and w.availability_status in ('available','scheduled')
        and not exists (
          select 1
          from public.operations_assignments a
          where a.tenant_id = w.tenant_id
            and (a.worker_id = w.id or exists (
              select 1 from public.operations_crew_members cm
              where cm.tenant_id = w.tenant_id and cm.worker_id = w.id and cm.crew_id = a.crew_id
            ))
            and a.status in ('scheduled','in_progress','blocked')
            and a.scheduled_start::date = current_date
        )
      order by w.name
      limit 6
      `,
      [workspaceId]
    )
  ]);

  const counts = countsResult?.rows[0];
  const ownerSummary = ownerSummaryResult?.rows[0];

  return {
    metrics: {
      followUpsDue: Number(counts?.followups_due ?? 0),
      actionQueue: Number(counts?.action_queue ?? 0),
      unpaidInvoices: Number(counts?.unpaid_invoices ?? 0),
      overdueInvoices: Number(counts?.overdue_invoices ?? 0),
      laborOpenRequests: Number(counts?.labor_open_requests ?? 0),
      laborAvailableWorkers: Number(counts?.labor_available_workers ?? 0),
      laborMatchApprovals: Number(counts?.labor_match_approvals ?? 0),
      paymentsCollected: money(counts?.payments_collected_cents),
      invoiceBalance: money(counts?.invoice_balance_cents),
      pipelineValue: money(counts?.pipeline_value_cents),
      visitors: Number(counts?.visitors ?? 0),
      adSpend: money(counts?.ad_spend_cents)
    },
    followUps: (followUpResult?.rows ?? []).map((row) => ({
      id: row.id,
      contactName: row.contact_name ?? "Follow-up",
      workflowType: row.workflow_type,
      dueAt: row.due_at,
      channel: row.channel,
      suggestedMessage: row.ai_suggested_message
    })),
    invoiceFollowUps: (invoiceResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      customerName: row.customer_name,
      status: row.status,
      balanceDue: money(row.balance_due_cents),
      dueDate: row.due_date
    })),
    ownerSummary: {
      incomeToday: money(ownerSummary?.income_today_cents),
      incomeWeek: money(ownerSummary?.income_week_cents),
      income30d: money(ownerSummary?.income_30d_cents),
      expensesToday: money(ownerSummary?.expenses_today_cents),
      expensesWeek: money(ownerSummary?.expenses_week_cents),
      expenses30d: money(ownerSummary?.expenses_30d_cents),
      jobCost30d: money(ownerSummary?.job_cost_30d_cents),
      overhead30d: money(ownerSummary?.overhead_30d_cents),
      net30d: money(Number(ownerSummary?.income_30d_cents ?? 0) - Number(ownerSummary?.expenses_30d_cents ?? 0)),
      hoursToday: Number(ownerSummary?.hours_today ?? 0),
      hoursWeek: Number(ownerSummary?.hours_week ?? 0),
      workingNow: Number(ownerSummary?.working_now ?? 0),
      scheduledToday: Number(ownerSummary?.scheduled_today ?? 0),
      openAssignments: Number(ownerSummary?.open_assignments ?? 0),
      activeWorkers: Number(ownerSummary?.active_workers ?? 0),
      offWorkers: Number(ownerSummary?.off_workers ?? 0),
      itineraryNeeded: Number(ownerSummary?.itinerary_needed ?? 0),
      expenseReview: Number(ownerSummary?.expense_review ?? 0),
      payrollReview: Number(ownerSummary?.payroll_review ?? 0),
      recurringExpenses: Number(ownerSummary?.recurring_expenses ?? 0),
      recurringDue: Number(ownerSummary?.recurring_due ?? 0),
      recurringExpensesReady: true,
      itineraryNeeds: (itineraryResult?.rows ?? []).map((worker) => ({
        id: worker.id,
        name: worker.name,
        roleType: worker.role_type,
        trade: worker.trade ?? "General",
        status: worker.availability_status
      }))
    }
  };
}

function buildTodayPlan(input: {
  openLeads: number;
  staleLeads: number;
  followUpsDue: number;
  actionQueue: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  pendingDrafts: number;
  pendingApprovals: number;
  laborOpenRequests: number;
  laborMatchApprovals: number;
}): DailyPriority[] {
  const priorities: DailyPriority[] = [];

  if (input.followUpsDue > 0) {
    priorities.push({
      id: "follow-ups",
      title: `${input.followUpsDue} follow-up${input.followUpsDue === 1 ? "" : "s"} due`,
      detail: "Start here. These are leads, callbacks, estimates, or invoices that need a human touch.",
      href: "/app/growth",
      buttonLabel: "Open follow-ups",
      urgency: "high"
    });
  }

  if (input.openLeads > 0) {
    priorities.push({
      id: "new-leads",
      title: `${input.openLeads} new lead${input.openLeads === 1 ? "" : "s"}`,
      detail: "Fast response matters. Review new requests and move real opportunities into the operating loop.",
      href: "/app/leads",
      buttonLabel: "Review leads",
      urgency: input.staleLeads > 0 ? "high" : "medium"
    });
  }

  if (input.overdueInvoices > 0) {
    priorities.push({
      id: "overdue-invoices",
      title: `${input.overdueInvoices} overdue invoice${input.overdueInvoices === 1 ? "" : "s"}`,
      detail: "Use a polite payment reminder before old balances become harder to collect.",
      href: "/app/service",
      buttonLabel: "Open invoices",
      urgency: "high"
    });
  } else if (input.unpaidInvoices > 0) {
    priorities.push({
      id: "unpaid-invoices",
      title: `${input.unpaidInvoices} unpaid invoice${input.unpaidInvoices === 1 ? "" : "s"}`,
      detail: "Keep cash collection visible without sending anything automatically.",
      href: "/app/service",
      buttonLabel: "Check invoices",
      urgency: "medium"
    });
  }

  if (input.actionQueue > 0) {
    priorities.push({
      id: "action-queue",
      title: `${input.actionQueue} action${input.actionQueue === 1 ? "" : "s"} waiting`,
      detail: "Approve, edit, or reject queued messages and automation steps before anything live can send.",
      href: "/app/actions",
      buttonLabel: "Review actions",
      urgency: "medium"
    });
  }

  if (input.laborMatchApprovals > 0) {
    priorities.push({
      id: "labor-matches",
      title: `${input.laborMatchApprovals} worker match${input.laborMatchApprovals === 1 ? "" : "es"} need review`,
      detail: "Ferocity found possible worker or subcontractor matches. Approve contact before anyone is reached.",
      href: "/app/labor-bench",
      buttonLabel: "Review matches",
      urgency: "medium"
    });
  } else if (input.laborOpenRequests > 0) {
    priorities.push({
      id: "labor-requests",
      title: `${input.laborOpenRequests} worker request${input.laborOpenRequests === 1 ? "" : "s"} open`,
      detail: "Open staffing needs should be matched, imported from worker intake, or marked manual before jobs get stuck.",
      href: "/app/labor-bench",
      buttonLabel: "Find workers",
      urgency: "medium"
    });
  }

  if (input.pendingApprovals > 0 || input.pendingDrafts > 0) {
    priorities.push({
      id: "marketing-review",
      title: "Marketing review needed",
      detail: `${input.pendingDrafts} draft${input.pendingDrafts === 1 ? "" : "s"} and ${input.pendingApprovals} approval${input.pendingApprovals === 1 ? "" : "s"} need a look before publishing.`,
      href: "/app/approvals",
      buttonLabel: "Review marketing",
      urgency: "low"
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      id: "healthy",
      title: "No urgent work found",
      detail: "Ferocity did not find overdue follow-ups, unpaid invoice pressure, or action queue items right now.",
      href: "/app/operator",
      buttonLabel: "Open operator console",
      urgency: "low"
    });
  }

  return priorities.slice(0, 4);
}

export async function getDashboardSnapshot() {
  const supabase = createSupabaseAdminClient();
  const workspace = await getCurrentWorkspace();
  const operational = await loadOperationalSnapshot(workspace.id);

  if (!supabase) {
    const brandResult = await queryPostgres<BrandRow>(
      `
      select name, slug, business_model, industry, primary_goal, risk_profile
      from public.brands
      where tenant_id = $1
      order by name
      `,
      [workspace.id]
    );
    const countResult = await queryPostgres<{
      open_leads: string;
      pending_drafts: string;
      pending_approvals: string;
      content_created_this_week: string;
      ai_recommendations: string;
      stale_leads: string;
    }>(
      `
      select
        (select count(*) from public.leads where tenant_id = $1 and status = 'new') as open_leads,
        (select count(*) from public.ai_drafts where tenant_id = $1 and status = 'needs_review') as pending_drafts,
        (select count(*) from public.approvals where tenant_id = $1 and status = 'pending') as pending_approvals,
        (select count(*) from public.ai_drafts where tenant_id = $1 and created_at >= date_trunc('week', now())) as content_created_this_week,
        (select count(*) from public.recommendations where tenant_id = $1 and status in ('open', 'approved')) as ai_recommendations,
        (select count(*) from public.leads where tenant_id = $1 and status in ('new', 'contacted') and created_at < now() - interval '3 days') as stale_leads
      `,
      [workspace.id]
    );
    const [leadsByBrand, leadsBySource, leadsByCampaign] = await Promise.all([
      queryPostgres<BreakdownRow>(
        `
        select b.name as label, count(*)::text as count
        from public.leads l
        join public.brands b on b.id = l.brand_id
        where l.tenant_id = $1
        group by b.name
        order by count(*) desc, b.name
        limit 8
        `,
        [workspace.id]
      ),
      queryPostgres<BreakdownRow>(
        `
        select coalesce(nullif(source, ''), 'Unknown') as label, count(*)::text as count
        from public.leads
        where tenant_id = $1
        group by coalesce(nullif(source, ''), 'Unknown')
        order by count(*) desc, label
        limit 8
        `,
        [workspace.id]
      ),
      queryPostgres<BreakdownRow>(
        `
        select coalesce(nullif(source_detail, ''), metadata_json->>'campaign', 'Untracked') as label, count(*)::text as count
        from public.leads
        where tenant_id = $1
        group by coalesce(nullif(source_detail, ''), metadata_json->>'campaign', 'Untracked')
        order by count(*) desc, label
        limit 8
        `,
        [workspace.id]
      )
    ]);

    if (brandResult) {
      const brands = brandResult.rows.map((brand) => ({
        name: brand.name,
        slug: brand.slug,
        businessModel: brand.business_model,
        industry: brand.industry ?? "Uncategorized",
        primaryGoal: brand.primary_goal ?? "No primary goal set.",
        riskProfile: brand.risk_profile
      }));
      const counts = countResult?.rows[0];
      const metrics = {
        brands: brands.length,
        openLeads: Number(counts?.open_leads ?? 0),
        pendingDrafts: Number(counts?.pending_drafts ?? 0),
        pendingApprovals: Number(counts?.pending_approvals ?? 0),
        contentCreatedThisWeek: Number(counts?.content_created_this_week ?? 0),
        aiRecommendations: Number(counts?.ai_recommendations ?? 0),
        staleLeads: Number(counts?.stale_leads ?? 0),
        ...operational.metrics
      };

      return {
        tenantName: workspace.name,
        brands,
        recommendations: starterRecommendations,
        tasks: starterTasks,
        metrics,
        todayPlan: buildTodayPlan(metrics),
        operator: {
          followUps: operational.followUps,
          invoiceFollowUps: operational.invoiceFollowUps,
          ownerSummary: operational.ownerSummary
        },
        reporting: {
          leadsByBrand: (leadsByBrand?.rows ?? []).map((row) => ({ label: row.label, count: Number(row.count) })),
          leadsBySource: (leadsBySource?.rows ?? []).map((row) => ({ label: row.label, count: Number(row.count) })),
          leadsByCampaign: (leadsByCampaign?.rows ?? []).map((row) => ({ label: row.label, count: Number(row.count) }))
        }
      };
    }

    const metrics = {
      brands: internalBrands.length,
      openLeads: 0,
      pendingDrafts: starterTasks.length,
      pendingApprovals: starterRecommendations.filter((item) => item.riskLevel !== "low").length,
      contentCreatedThisWeek: 0,
      aiRecommendations: starterRecommendations.length,
      staleLeads: 0,
      ...operational.metrics
    };

    return {
      tenantName: "Internal Portfolio",
      brands: internalBrands,
      recommendations: starterRecommendations,
      tasks: starterTasks,
      metrics,
      todayPlan: buildTodayPlan(metrics),
      operator: {
        followUps: operational.followUps,
        invoiceFollowUps: operational.invoiceFollowUps,
        ownerSummary: operational.ownerSummary
      },
      reporting: {
        leadsByBrand: [],
        leadsBySource: [],
        leadsByCampaign: []
      }
    };
  }

  const [{ data: brandRows, count: brandCount }, { count: leadCount }, { count: draftCount }, { count: approvalCount }] =
    await Promise.all([
      supabase
        .from("brands")
        .select("name, slug, business_model, industry, primary_goal, risk_profile", { count: "exact" })
        .eq("tenant_id", workspace.id)
        .order("name"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", workspace.id).eq("status", "new"),
      supabase.from("ai_drafts").select("id", { count: "exact", head: true }).eq("tenant_id", workspace.id).eq("status", "needs_review"),
      supabase.from("approvals").select("id", { count: "exact", head: true }).eq("tenant_id", workspace.id).eq("status", "pending")
    ]);

  const brands = ((brandRows as BrandRow[] | null) ?? []).map((brand) => ({
    name: brand.name,
    slug: brand.slug,
    businessModel: brand.business_model,
    industry: brand.industry ?? "Uncategorized",
    primaryGoal: brand.primary_goal ?? "No primary goal set.",
    riskProfile: brand.risk_profile
  }));
  const metrics = {
    brands: brandCount ?? internalBrands.length,
    openLeads: leadCount ?? 0,
    pendingDrafts: draftCount ?? 0,
    pendingApprovals: approvalCount ?? 0,
    contentCreatedThisWeek: 0,
    aiRecommendations: starterRecommendations.length,
    staleLeads: 0,
    ...operational.metrics
  };

  return {
    tenantName: workspace.name,
    brands: brands.length > 0 ? brands : internalBrands,
    recommendations: starterRecommendations,
    tasks: starterTasks,
    metrics,
    todayPlan: buildTodayPlan(metrics),
    operator: {
      followUps: operational.followUps,
      invoiceFollowUps: operational.invoiceFollowUps,
      ownerSummary: operational.ownerSummary
    },
    reporting: {
      leadsByBrand: [],
      leadsBySource: [],
      leadsByCampaign: []
    }
  };
}
