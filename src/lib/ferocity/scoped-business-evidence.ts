import "server-only";

import { queryPostgres } from "@/lib/db/postgres";
import type { FerocityCommandCapability } from "@/lib/ai-workforce/command-understanding";
import { getStatementYearCoverage } from "@/lib/document-intelligence/statement-year-coverage";

export const ferocityEvidenceDomains = [
  "customers",
  "jobs_schedule",
  "money_documents",
  "inventory_purchasing",
  "communications",
  "integrations_controls",
  "growth_reputation",
  "workforce",
] as const;

export type FerocityEvidenceDomain = (typeof ferocityEvidenceDomains)[number];

export type FerocityScopedEvidence = {
  key: FerocityEvidenceDomain;
  title: string;
  href: string;
  status: "verified" | "empty" | "unavailable";
  summary: string;
  facts: string[];
  checkedAt: string;
};

const evidenceDestinations: Record<FerocityEvidenceDomain, string> = {
  customers: "/app/leads",
  jobs_schedule: "/app/schedule",
  money_documents: "/app/expenses",
  inventory_purchasing: "/app/purchasing",
  communications: "/app/customer-touchpoints",
  integrations_controls: "/app/integrations",
  growth_reputation: "/app/growth",
  workforce: "/app/operations-workforce",
};

const capabilityDomains: Partial<Record<FerocityCommandCapability, FerocityEvidenceDomain[]>> = {
  customers_crm: ["customers"],
  lead_follow_up: ["customers"],
  collections: ["money_documents"],
  payments_deposits: ["money_documents"],
  jobs_estimates: ["jobs_schedule"],
  schedule_dispatch: ["jobs_schedule"],
  expenses_tax: ["money_documents"],
  pos_inventory: ["inventory_purchasing"],
  purchasing_suppliers: ["inventory_purchasing"],
  communications: ["communications"],
  calls_office: ["communications"],
  integrations_automation: ["integrations_controls"],
  approvals_controls: ["integrations_controls"],
  marketing: ["growth_reputation"],
  seo: ["growth_reputation"],
  website: ["growth_reputation"],
  reviews_proof: ["growth_reputation"],
  growth_revenue: ["growth_reputation", "customers", "money_documents"],
  workforce_time: ["workforce"],
};

function mentions(command: string, terms: string[]) {
  const normalized = command.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export function evidenceDomainsForFerocityCommand(
  command: string,
  capabilities: FerocityCommandCapability[],
) {
  const selected = new Set<FerocityEvidenceDomain>();
  if (mentions(command, ["customer", "crm", "lead", "estimate"])) selected.add("customers");
  if (mentions(command, ["job", "schedule", "dispatch", "appointment", "crew"])) selected.add("jobs_schedule");
  if (mentions(command, ["expense", "receipt", "statement", "tax", "invoice", "deposit", "payment", "cash", "financial document"])) selected.add("money_documents");
  if (mentions(command, ["inventory", "stock", "point of sale", "pos", "purchase order", "supplier", "vendor", "materials"])) selected.add("inventory_purchasing");
  if (mentions(command, ["email", "message", "text", "call", "inbox", "conversation"])) selected.add("communications");
  if (mentions(command, ["integration", "provider", "oauth", "approval", "control", "automation"])) selected.add("integrations_controls");
  if (mentions(command, ["marketing", "campaign", "seo", "website", "customer review", "reviews", "reputation", "content", "growth"])) selected.add("growth_reputation");
  if (mentions(command, ["employee", "worker", "timesheet", "hours", "payroll", "labor"])) selected.add("workforce");
  if (mentions(command, ["check everything", "whole business", "business scan"])) {
    return [...ferocityEvidenceDomains];
  }
  for (const capability of capabilities) {
    for (const domain of capabilityDomains[capability] ?? []) selected.add(domain);
  }
  return [...selected].slice(0, 4);
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(cents: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric(cents) / 100);
}

export function requestedFinancialYear(command: string) {
  const match = command.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  const latestAllowed = new Date().getFullYear() + 1;
  return Number.isInteger(year) && year >= 2000 && year <= latestAllowed ? year : null;
}

async function loadDomain(
  tenantId: string,
  domain: FerocityEvidenceDomain,
  command: string,
): Promise<Omit<FerocityScopedEvidence, "checkedAt">> {
  switch (domain) {
    case "customers": {
      const [result, detailResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.customers where tenant_id=$1)::text as customers,
          (select count(*) from public.leads where tenant_id=$1 and status in ('new','contacted','qualified'))::text as open_leads,
          (select count(*) from public.leads where tenant_id=$1 and status in ('new','contacted','qualified') and greatest(created_at,updated_at)<now()-interval '2 days')::text as stale_leads,
          (select count(*) from public.service_estimates where tenant_id=$1 and status in ('draft','sent_manually','expired'))::text as open_estimates`,
        [tenantId],
      ), queryPostgres<{ name: string; status: string; age_days: string }>(
        `select name,status,extract(day from now()-greatest(created_at,updated_at))::int::text as age_days
         from public.leads where tenant_id=$1 and status in ('new','contacted','qualified')
           and greatest(created_at,updated_at)<now()-interval '2 days'
         order by greatest(created_at,updated_at) asc limit 5`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      const total = numeric(row.customers) + numeric(row.open_leads) + numeric(row.open_estimates);
      return {
        key: domain,
        title: "Customers, leads, and estimates",
        href: "/app/leads",
        status: total ? "verified" : "empty",
        summary: `${numeric(row.customers)} customers, ${numeric(row.open_leads)} open leads, ${numeric(row.stale_leads)} stale leads, and ${numeric(row.open_estimates)} open estimates.`,
        facts: [
          `${numeric(row.stale_leads)} open leads have had no progress for at least two days.`,
          `${numeric(row.open_estimates)} estimates remain draft, sent without a sale, or expired.`,
          ...(detailResult?.rows ?? []).map((lead) => `${lead.name}: ${lead.status}, unchanged for ${lead.age_days} days.`),
        ],
      };
    }
    case "jobs_schedule": {
      const [result, detailResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.service_jobs where tenant_id=$1 and status in ('unscheduled','scheduled','in_progress'))::text as active_jobs,
          (select count(*) from public.service_jobs where tenant_id=$1 and status='unscheduled')::text as unscheduled_jobs,
          (select count(*) from public.service_visits where tenant_id=$1 and status not in ('completed','canceled','no_show') and scheduled_start between now() and now()+interval '14 days')::text as upcoming_visits,
          (select count(*) from public.service_visit_conflicts where tenant_id=$1 and status in ('open','acknowledged'))::text as open_conflicts`,
        [tenantId],
      ), queryPostgres<{ title: string; status: string; scheduled_start: string | null }>(
        `select title,status,scheduled_start::text from public.service_jobs
         where tenant_id=$1 and status in ('unscheduled','scheduled','in_progress')
         order by case status when 'unscheduled' then 0 when 'in_progress' then 1 else 2 end,scheduled_start nulls first limit 5`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      return {
        key: domain,
        title: "Jobs and schedule",
        href: "/app/schedule",
        status: numeric(row.active_jobs) + numeric(row.upcoming_visits) ? "verified" : "empty",
        summary: `${numeric(row.active_jobs)} active jobs, ${numeric(row.unscheduled_jobs)} unscheduled jobs, and ${numeric(row.upcoming_visits)} visits in the next 14 days.`,
        facts: [
          `${numeric(row.open_conflicts)} scheduling conflicts are still open or acknowledged.`,
          ...(detailResult?.rows ?? []).map((job) => `${job.title}: ${job.status}${job.scheduled_start ? `, scheduled ${job.scheduled_start}` : ", no scheduled start"}.`),
        ],
      };
    }
    case "money_documents": {
      const financialYear = requestedFinancialYear(command);
      const includeDepositSourceNames = mentions(command, [
        "who paid", "who sent", "payer", "tenant paid", "tenant payment", "deposit name", "source name",
      ]);
      const [result, documentResult, invoiceResult, statementCoverage, depositSourceResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.document_intelligence_documents where tenant_id=$1 and source_product='ferocity')::text as documents,
          (select count(*) from public.document_intelligence_documents where tenant_id=$1 and source_product='ferocity' and status='needs_review')::text as documents_needing_review,
          (select count(*) from public.service_invoices where tenant_id=$1 and status in ('sent_manually','partially_paid','overdue') and greatest(total_cents-amount_paid_cents-write_off_cents,0)>0)::text as unpaid_invoices,
          (select coalesce(sum(greatest(total_cents-amount_paid_cents-write_off_cents,0)),0) from public.service_invoices where tenant_id=$1 and status in ('sent_manually','partially_paid','overdue'))::text as outstanding_cents,
          (select count(*) from public.document_intelligence_transactions where tenant_id=$1 and status='needs_review')::text as transactions_needing_review,
          (select count(*) from public.document_intelligence_transactions t
            where t.tenant_id=$1 and t.direction='debit' and t.is_transfer=false
              and t.posted_expense_ref is null and t.status in ('needs_review','approved')
              and ($2::int is null or (coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
                and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1))))::text as expense_candidates,
          (select count(*) from public.document_intelligence_transactions t
            where t.tenant_id=$1 and t.direction='credit' and t.is_transfer=false
              and t.status in ('needs_review','approved')
              and ($2::int is null or (coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
                and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1))))::text as deposits,
          (select count(distinct nullif(lower(trim(coalesce(
              t.metadata_json->>'counterpartyHandle',t.metadata_json->>'counterpartyName',t.merchant_name,t.description
            ))),'')) from public.document_intelligence_transactions t
            where t.tenant_id=$1 and t.direction='credit' and t.is_transfer=false
              and t.status in ('needs_review','approved')
              and ($2::int is null or (coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
                and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1))))::text as deposit_sources,
          (select count(*) from public.document_intelligence_transactions t
            where t.tenant_id=$1 and t.direction='credit' and t.is_transfer=false
              and t.status in ('needs_review','approved') and t.allocation_target_ref is not null
              and ($2::int is null or (coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
                and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1))))::text as assigned_deposits`,
        [tenantId, financialYear],
      ), queryPostgres<{ original_file_name: string; document_type: string; status: string; total_cents: number | null }>(
        `select original_file_name,document_type,status,total_cents from public.document_intelligence_documents
         where tenant_id=$1 and source_product='ferocity' and status='needs_review'
         order by created_at desc limit 4`,
        [tenantId],
      ), queryPostgres<{ title: string; customer_name: string; balance_cents: number }>(
        `select i.title,c.name as customer_name,greatest(i.total_cents-i.amount_paid_cents-i.write_off_cents,0) as balance_cents
         from public.service_invoices i join public.customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id
         where i.tenant_id=$1 and i.status in ('sent_manually','partially_paid','overdue')
           and greatest(i.total_cents-i.amount_paid_cents-i.write_off_cents,0)>0
         order by i.due_date asc nulls first limit 4`,
        [tenantId],
      ), financialYear ? getStatementYearCoverage(tenantId, financialYear) : Promise.resolve(null),
      includeDepositSourceNames ? queryPostgres<{ source_label: string; payment_count: string; total_cents: string }>(`
        select trim(t.metadata_json->>'counterpartyName') as source_label,
          count(*)::text as payment_count, sum(t.amount_cents)::text as total_cents
        from public.document_intelligence_transactions t
        where t.tenant_id=$1 and t.direction='credit' and t.is_transfer=false
          and t.status in ('needs_review','approved')
          and t.metadata_json->>'transactionType'='cash_app_payment'
          and nullif(trim(t.metadata_json->>'counterpartyName'),'') is not null
          and ($2::int is null or (coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
            and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1)))
        group by lower(trim(t.metadata_json->>'counterpartyName')),trim(t.metadata_json->>'counterpartyName')
        order by count(*) desc,trim(t.metadata_json->>'counterpartyName')
        limit 50`, [tenantId, financialYear]) : Promise.resolve(null)]);
      const row = result?.rows[0] ?? {};
      const total = numeric(row.documents) + numeric(row.unpaid_invoices);
      const periodLabel = financialYear ? `${financialYear}` : "all imported years";
      const namedDepositSources = (depositSourceResult?.rows ?? []).map((source) =>
        `${source.source_label} (${numeric(source.payment_count)} payment${numeric(source.payment_count) === 1 ? "" : "s"}, ${money(source.total_cents)})`
      );
      return {
        key: domain,
        title: "Money and financial documents",
        href: "/app/expenses",
        status: total ? "verified" : "empty",
        summary: `${numeric(row.documents)} imported financial documents; ${numeric(row.documents_needing_review)} documents and ${numeric(row.transactions_needing_review)} transactions need review.`,
        facts: [
          `${numeric(row.unpaid_invoices)} invoices have ${money(row.outstanding_cents)} outstanding.`,
          `${periodLabel}: ${numeric(row.expense_candidates)} non-transfer debit expense candidates and ${numeric(row.deposits)} non-transfer deposit rows are preserved.`,
          `${periodLabel}: ${numeric(row.deposit_sources)} distinct payer/source labels are present; ${numeric(row.assigned_deposits)} deposit rows have an authoritative allocation. Source labels are not confirmed tenants until matched.`,
          ...(namedDepositSources.length ? [
            `${periodLabel} named incoming Cash App source labels (not yet confirmed as tenants): ${namedDepositSources.join("; ")}. Merchant refunds and other credit types are excluded from this name list.`,
          ] : []),
          ...(statementCoverage ? [statementCoverage.message] : []),
          ...(documentResult?.rows ?? []).map((document) => `${document.original_file_name}: ${document.document_type}, ${document.status}${document.total_cents === null ? "" : `, ${money(document.total_cents)}`}.`),
          ...(invoiceResult?.rows ?? []).map((invoice) => `${invoice.customer_name} — ${invoice.title}: ${money(invoice.balance_cents)} outstanding.`),
        ],
      };
    }
    case "inventory_purchasing": {
      const [result, inventoryResult, orderResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.service_inventory_items where tenant_id=$1 and status<>'retired')::text as inventory_items,
          (select count(*) from public.service_inventory_items where tenant_id=$1 and status<>'retired' and reorder_threshold>0 and quantity<=reorder_threshold)::text as low_stock,
          (select count(*) from public.purchase_orders where tenant_id=$1 and status not in ('cancelled','delivered','reconciled'))::text as open_orders,
          (select coalesce(sum(total_cents),0) from public.purchase_orders where tenant_id=$1 and status in ('approved','ordered','picked_up'))::text as committed_cents,
          (select count(*) from public.vendor_bills where tenant_id=$1 and status in ('draft','review'))::text as bills_to_review`,
        [tenantId],
      ), queryPostgres<{ name: string; quantity: string; reorder_threshold: string; unit: string | null }>(
        `select name,quantity::text,reorder_threshold::text,unit from public.service_inventory_items
         where tenant_id=$1 and status<>'retired' and reorder_threshold>0 and quantity<=reorder_threshold
         order by (quantity-reorder_threshold) asc,name limit 6`,
        [tenantId],
      ), queryPostgres<{ po_number: string | null; status: string; supplier_name: string | null; total_cents: number }>(
        `select po.po_number,po.status,s.name as supplier_name,po.total_cents
         from public.purchase_orders po left join public.suppliers s on s.tenant_id=po.tenant_id and s.id=po.supplier_id
         where po.tenant_id=$1 and po.status not in ('cancelled','delivered','reconciled')
         order by po.required_date nulls last,po.created_at desc limit 5`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      return {
        key: domain,
        title: "Inventory and purchasing",
        href: "/app/purchasing",
        status: numeric(row.inventory_items) + numeric(row.open_orders) ? "verified" : "empty",
        summary: `${numeric(row.inventory_items)} inventory items, ${numeric(row.low_stock)} at or below reorder level, and ${numeric(row.open_orders)} open purchase orders.`,
        facts: [
          `${money(row.committed_cents)} is committed on active purchase orders; ${numeric(row.bills_to_review)} vendor bills need review.`,
          ...(inventoryResult?.rows ?? []).map((item) => `${item.name}: ${item.quantity}${item.unit ? ` ${item.unit}` : ""} on hand; reorder level ${item.reorder_threshold}${item.unit ? ` ${item.unit}` : ""}.`),
          ...(orderResult?.rows ?? []).map((order) => `${order.po_number ?? "Draft PO"}: ${order.status}, ${order.supplier_name ?? "supplier needed"}, ${money(order.total_cents)}.`),
        ],
      };
    }
    case "communications": {
      const [result, detailResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.office_manager_conversation_sessions where tenant_id=$1 and status in ('open','waiting_on_customer','waiting_on_owner'))::text as open_sessions,
          (select count(*) from public.office_manager_conversation_sessions where tenant_id=$1 and status='waiting_on_owner')::text as waiting_on_owner,
          (select count(*) from public.office_manager_action_requests where tenant_id=$1 and status in ('draft','needs_review','queued','blocked'))::text as pending_actions,
          (select count(*) from public.office_manager_channel_configs where tenant_id=$1 and live_actions_enabled=true)::text as live_channels`,
        [tenantId],
      ), queryPostgres<{ channel_key: string; status: string; intent_key: string | null; summary: string | null }>(
        `select channel_key,status,intent_key,summary from public.office_manager_conversation_sessions
         where tenant_id=$1 and status in ('open','waiting_on_customer','waiting_on_owner')
         order by coalesce(last_message_at,started_at) desc limit 6`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      return {
        key: domain,
        title: "Customer communications",
        href: "/app/customer-touchpoints",
        status: numeric(row.open_sessions) + numeric(row.pending_actions) + numeric(row.live_channels) ? "verified" : "empty",
        summary: `${numeric(row.open_sessions)} open conversations, ${numeric(row.waiting_on_owner)} waiting on the owner, and ${numeric(row.pending_actions)} communication actions pending.`,
        facts: [
          `${numeric(row.live_channels)} communication channels currently allow live actions under their configured controls.`,
          ...(detailResult?.rows ?? []).map((session) => `${session.channel_key}: ${session.status}${session.intent_key ? `, ${session.intent_key}` : ""}${session.summary ? ` — ${session.summary}` : ""}.`),
        ],
      };
    }
    case "integrations_controls": {
      const [result, detailResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.integration_connections where tenant_id=$1)::text as connections,
          (select count(*) from public.integration_connections where tenant_id=$1 and status='connected')::text as connected,
          (select count(*) from public.integration_connections where tenant_id=$1 and status in ('error','blocked','disconnected'))::text as unhealthy,
          (select count(*) from public.provider_accounts where tenant_id=$1 and credentials_status='configured')::text as configured_accounts,
          (select count(*) from public.office_manager_action_requests where tenant_id=$1 and status='needs_review')::text as pending_approvals`,
        [tenantId],
      ), queryPostgres<{ display_name: string; status: string; credentials_status: string }>(
        `select display_name,status,credentials_status from public.integration_connections
         where tenant_id=$1 and status<>'connected'
         order by case status when 'error' then 0 when 'blocked' then 1 else 2 end,display_name limit 8`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      return {
        key: domain,
        title: "Connections and approvals",
        href: "/app/integrations",
        status: numeric(row.connections) + numeric(row.configured_accounts) ? "verified" : "empty",
        summary: `${numeric(row.connected)} of ${numeric(row.connections)} integration records are connected; ${numeric(row.configured_accounts)} provider accounts have configured credentials.`,
        facts: [
          `${numeric(row.unhealthy)} connections are unhealthy and ${numeric(row.pending_approvals)} actions await review.`,
          ...(detailResult?.rows ?? []).map((connection) => `${connection.display_name}: ${connection.status}; credentials ${connection.credentials_status}.`),
        ],
      };
    }
    case "growth_reputation": {
      const [result, detailResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.growth_objectives where tenant_id=$1 and status='active')::text as active_objectives,
          (select count(*) from public.content_studio_outputs where tenant_id=$1 and status in ('draft','needs_review'))::text as draft_content,
          (select count(*) from public.publishing_queue where tenant_id=$1 and queue_status in ('draft','needs_approval','approved','scheduled'))::text as publishing_items,
          (select count(*) from public.review_request_workflows where tenant_id=$1 and status in ('draft','scheduled'))::text as review_workflows`,
        [tenantId],
      ), queryPostgres<{ title: string; output_type: string; status: string }>(
        `select title,output_type,status from public.content_studio_outputs
         where tenant_id=$1 and status in ('draft','needs_review')
         order by updated_at desc limit 6`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      return {
        key: domain,
        title: "Growth and reputation",
        href: "/app/growth",
        status: numeric(row.active_objectives) + numeric(row.draft_content) + numeric(row.publishing_items) + numeric(row.review_workflows) ? "verified" : "empty",
        summary: `${numeric(row.active_objectives)} active growth objectives, ${numeric(row.draft_content)} draft content items, and ${numeric(row.publishing_items)} publishing items in progress.`,
        facts: [
          `${numeric(row.review_workflows)} review-request workflows are drafted or scheduled.`,
          ...(detailResult?.rows ?? []).map((output) => `${output.title}: ${output.output_type.replaceAll("_", " ")}, ${output.status}.`),
        ],
      };
    }
    case "workforce": {
      const [result, detailResult] = await Promise.all([queryPostgres<Record<string, unknown>>(
        `select
          (select count(*) from public.operations_workers where tenant_id=$1 and availability_status<>'inactive')::text as active_workers,
          (select count(*) from public.operations_workers where tenant_id=$1 and availability_status in ('off','blocked'))::text as unavailable_workers,
          (select count(*) from public.operations_time_entries where tenant_id=$1 and status in ('open','needs_review'))::text as time_entries_needing_review,
          (select coalesce(sum(greatest(extract(epoch from (coalesce(clock_out_at,now())-clock_in_at))/60-break_minutes,0)),0)
             from public.operations_time_entries where tenant_id=$1 and clock_in_at>=date_trunc('week',now()))::text as week_minutes`,
        [tenantId],
      ), queryPostgres<{ worker_name: string; status: string; clock_in_at: string; clock_out_at: string | null }>(
        `select coalesce(w.name,'Unassigned worker') as worker_name,t.status,t.clock_in_at::text,t.clock_out_at::text
         from public.operations_time_entries t left join public.operations_workers w on w.tenant_id=t.tenant_id and w.id=t.worker_id
         where t.tenant_id=$1 and t.status in ('open','needs_review')
         order by t.clock_in_at desc limit 6`,
        [tenantId],
      )]);
      const row = result?.rows[0] ?? {};
      return {
        key: domain,
        title: "Team and time",
        href: "/app/operations-workforce",
        status: numeric(row.active_workers) + numeric(row.time_entries_needing_review) ? "verified" : "empty",
        summary: `${numeric(row.active_workers)} active workers, ${numeric(row.unavailable_workers)} unavailable, and ${numeric(row.time_entries_needing_review)} time entries need review.`,
        facts: [
          `${(numeric(row.week_minutes) / 60).toFixed(1)} recorded labor hours fall in the current week.`,
          ...(detailResult?.rows ?? []).map((entry) => `${entry.worker_name}: ${entry.status}, clocked in ${entry.clock_in_at}${entry.clock_out_at ? ` and out ${entry.clock_out_at}` : ", still open"}.`),
        ],
      };
    }
  }
}

export async function collectFerocityScopedEvidence(input: {
  tenantId: string;
  command: string;
  capabilities: FerocityCommandCapability[];
}) {
  const domains = evidenceDomainsForFerocityCommand(input.command, input.capabilities);
  const checkedAt = new Date().toISOString();
  return Promise.all(domains.map(async (domain): Promise<FerocityScopedEvidence> => {
    try {
      return { ...(await loadDomain(input.tenantId, domain, input.command)), checkedAt };
    } catch {
      return {
        key: domain,
        title: domain.replaceAll("_", " "),
        href: evidenceDestinations[domain],
        status: "unavailable",
        summary: "Ferocity could not verify this workspace area during the current request.",
        facts: [],
        checkedAt,
      };
    }
  }));
}

export function scopedEvidencePrompt(evidence: FerocityScopedEvidence[]) {
  return evidence.map((item) => [
    `[${item.key}] ${item.title}`,
    `status=${item.status}`,
    item.summary,
    ...item.facts,
    `destination=${item.href}`,
  ].join(" | ")).join("\n");
}
