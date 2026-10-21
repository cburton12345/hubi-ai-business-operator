import { queryPostgresRequired as queryPostgres } from "@/lib/db/postgres";
import { getFerocityChatOverview, type FerocityChatAttentionItem } from "@/lib/ferocity/get-chat-overview";

type TodayRow = {
  workspace_name: string;
  open_pipeline_cents: string;
  unpaid_invoices: string;
  overdue_invoices: string;
  outstanding_cents: string;
  open_estimates: string;
  open_leads: string;
  collected_revenue_cents: string;
};

type ProviderGapRow = { provider: string; display_name: string; status: string; credentials_status: string };
type AiActionRow = { id: string; title: string; summary: string; ai_summary: string | null };

function numeric(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getTodayOverview(tenantId: string): Promise<{
  workspaceName: string;
  ownerNeeds: number;
  criticalIssues: number;
  openPipelineCents: number;
  unpaidInvoices: number;
  collectedRevenueCents: number;
  doFirst: FerocityChatAttentionItem[];
  moneyMoves: FerocityChatAttentionItem[];
  direction: FerocityChatAttentionItem;
  providerGaps: Array<{ displayName: string; nextStep: string }>;
  aiActions: AiActionRow[];
}> {
  const [chatOverview, result, providerResult, aiActionResult] = await Promise.all([
    getFerocityChatOverview(tenantId),
    queryPostgres<TodayRow>(
      `select
         t.name as workspace_name,
         (select coalesce(sum(value_cents),0) from public.opportunities
           where tenant_id=$1 and status='open')::text as open_pipeline_cents,
         (select count(*) from public.service_invoices
           where tenant_id=$1 and status in ('draft','sent_manually','partially_paid','overdue')
             and greatest(total_cents-amount_paid_cents-write_off_cents,0)>0)::text as unpaid_invoices,
         (select count(*) from public.service_invoices
           where tenant_id=$1 and status in ('sent_manually','partially_paid','overdue')
             and coalesce(due_date,created_at::date)<=current_date
             and greatest(total_cents-amount_paid_cents-write_off_cents,0)>0)::text as overdue_invoices,
         (select coalesce(sum(greatest(total_cents-amount_paid_cents-write_off_cents,0)),0)
           from public.service_invoices
           where tenant_id=$1 and status in ('sent_manually','partially_paid','overdue'))::text as outstanding_cents,
         (select count(*) from public.service_estimates
           where tenant_id=$1 and status in ('draft','sent_manually','expired'))::text as open_estimates,
         (select count(*) from public.leads
           where tenant_id=$1 and status in ('new','contacted','qualified'))::text as open_leads,
         (select coalesce(sum(greatest(amount_cents-refunded_amount_cents,0)),0)
           from public.service_invoice_payments
           where tenant_id=$1 and status in ('succeeded','manual','partially_refunded','refunded'))::text as collected_revenue_cents
       from public.tenants t where t.id=$1`,
      [tenantId],
    ),
    queryPostgres<ProviderGapRow>(
      `select provider,display_name,status,credentials_status from public.integration_connections
       where tenant_id=$1 and (
         status='error'
         or credentials_status in ('expired','invalid')
         or ((status in ('not_connected','planned') or credentials_status='not_configured')
           and coalesce((metadata_json->>'requestedByOwner')::boolean,false))
       ) order by updated_at desc limit 4`,
      [tenantId],
    ),
    queryPostgres<AiActionRow>(
      `select id,title,summary,ai_summary from public.owner_command_events
       where tenant_id=$1 and ai_handled=true and status='ai_handled'
       order by occurred_at desc limit 4`,
      [tenantId],
    ),
  ]);
  const row = result?.rows[0];
  const unpaidInvoices = numeric(row?.unpaid_invoices);
  const overdueInvoices = numeric(row?.overdue_invoices);
  const outstandingCents = numeric(row?.outstanding_cents);
  const openEstimates = numeric(row?.open_estimates);
  const openLeads = numeric(row?.open_leads);
  const moneyMoves: FerocityChatAttentionItem[] = [];

  if (unpaidInvoices) moneyMoves.push({
    title: overdueInvoices ? "Collect overdue balances" : "Follow up unpaid invoices",
    detail: `${unpaidInvoices} unpaid ${unpaidInvoices === 1 ? "invoice" : "invoices"}${outstandingCents ? ` totaling ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(outstandingCents / 100)}` : ""}.`,
    href: "/app/cash-collection",
    urgency: overdueInvoices ? "high" : "medium",
  });
  if (openEstimates) moneyMoves.push({
    title: "Move open estimates forward",
    detail: `${openEstimates} ${openEstimates === 1 ? "estimate is" : "estimates are"} still draft, sent without a sale, or expired.`,
    href: "/app/estimator",
    urgency: "medium",
  });
  if (openLeads) moneyMoves.push({
    title: "Work open leads",
    detail: `${openLeads} open ${openLeads === 1 ? "lead needs" : "leads need"} response, qualification, or follow-up.`,
    href: "/app/lead-command",
    urgency: "medium",
  });

  const criticalIssues = chatOverview.attentionItems.filter((item) => item.urgency === "critical").length;
  const direction = chatOverview.attentionItems[0] ?? moneyMoves[0] ?? {
    title: "Ask Ferocity what to accomplish next",
    detail: "No urgent owner decision is blocking current work.",
    href: "/app/ferocity",
    urgency: "low" as const,
  };

  return {
    workspaceName: row?.workspace_name ?? "Workspace",
    ownerNeeds: chatOverview.attentionItems.length,
    criticalIssues,
    openPipelineCents: numeric(row?.open_pipeline_cents),
    unpaidInvoices,
    collectedRevenueCents: numeric(row?.collected_revenue_cents),
    doFirst: chatOverview.attentionItems.slice(0, 3),
    moneyMoves: moneyMoves.slice(0, 2),
    direction,
    providerGaps: (providerResult?.rows ?? []).map((provider) => ({
      displayName: provider.display_name || provider.provider.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase()),
      nextStep: provider.credentials_status === "expired" || provider.credentials_status === "invalid"
        ? "Reconnect this account to restore its authorized access."
        : provider.credentials_status === "not_configured"
          ? "Connect and authorize the account Ferocity should use."
          : `Resolve the current ${provider.status.replaceAll("_", " ")} connection state.`,
    })),
    aiActions: aiActionResult?.rows ?? [],
  };
}
