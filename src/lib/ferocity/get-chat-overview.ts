import { queryPostgres } from "@/lib/db/postgres";
import {
  buildBusinessOpportunityBrief,
  type BusinessOpportunityBrief,
  type OpportunityCandidate,
} from "@/lib/attention-command/business-opportunity-diagnostic";

export type FerocityChatAttentionItem = {
  title: string;
  detail: string;
  href: string;
  urgency: "critical" | "high" | "medium" | "low";
};

type OverviewRow = {
  critical_events: string;
  owner_events: string;
  growth_approvals: string;
  provider_gaps: string;
  document_review: string;
};

function count(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getFerocityChatOverview(tenantId: string): Promise<{
  attentionItems: FerocityChatAttentionItem[];
  opportunityBrief: BusinessOpportunityBrief;
}> {
  const result = await queryPostgres<OverviewRow>(
    `select
       (select count(*) from public.owner_command_events
         where (tenant_id=$1 or tenant_id is null)
           and (severity='critical' or status='critical')
           and status not in ('resolved','ai_handled'))::text as critical_events,
       (select count(*) from public.owner_command_events
         where (tenant_id=$1 or tenant_id is null)
           and (owner_attention=true or status='needs_owner')
           and status not in ('resolved','ai_handled'))::text as owner_events,
       (select count(*) from public.marketing_campaign_recommendations
         where tenant_id=$1 and execution_status='waiting_approval'
           and status not in ('dismissed','paused'))::text as growth_approvals,
       (select count(*) from public.integration_connections
         where tenant_id=$1 and (
           status='error'
           or credentials_status in ('expired','invalid')
           or ((status in ('not_connected','planned') or credentials_status='not_configured')
             and coalesce((metadata_json->>'requestedByOwner')::boolean,false))
         ))::text as provider_gaps,
       (select count(*) from public.document_intelligence_documents
         where tenant_id=$1 and status in ('needs_review','failed'))::text as document_review`,
    [tenantId],
  );
  const row = result?.rows[0];
  const criticalEvents = count(row?.critical_events);
  const ownerEvents = count(row?.owner_events);
  const growthApprovals = count(row?.growth_approvals);
  const providerGaps = count(row?.provider_gaps);
  const documentReview = count(row?.document_review);

  const attentionItems: FerocityChatAttentionItem[] = [];
  if (criticalEvents) attentionItems.push({
    title: "A critical issue needs your decision",
    detail: `${criticalEvents} critical business ${criticalEvents === 1 ? "issue is" : "issues are"} still open.`,
    href: "/app/owner-command-center",
    urgency: "critical",
  });
  if (ownerEvents) attentionItems.push({
    title: "Ferocity needs owner input",
    detail: `${ownerEvents} ${ownerEvents === 1 ? "item is" : "items are"} waiting for a decision Ferocity cannot safely make alone.`,
    href: "/app/owner-command-center",
    urgency: "high",
  });
  if (growthApprovals) attentionItems.push({
    title: "A growth move is ready for your decision",
    detail: `${growthApprovals} prioritized growth ${growthApprovals === 1 ? "action involves" : "actions involve"} publishing, outreach, spend, or another protected step.`,
    href: "/app/growth",
    urgency: "high",
  });
  if (documentReview) attentionItems.push({
    title: "Financial documents need review",
    detail: `${documentReview} ${documentReview === 1 ? "document needs" : "documents need"} verification before reports or tax workpapers can be treated as final.`,
    href: "/app/expenses",
    urgency: "medium",
  });
  if (providerGaps) attentionItems.push({
    title: "A requested connection needs attention",
    detail: `${providerGaps} requested ${providerGaps === 1 ? "connection is" : "connections are"} missing, revoked, or reporting an error.`,
    href: "/app/integrations",
    urgency: "medium",
  });

  const candidates: OpportunityCandidate[] = attentionItems.map((item) => ({
    ...item,
    evidence: "Current workspace records and connection state.",
    confidence: 97,
    handling: item.href === "/app/integrations"
      ? "connection_required"
      : item.urgency === "critical" || /decision|review/i.test(`${item.title} ${item.detail}`)
        ? "owner_decision"
        : "ferocity_can_prepare",
  }));

  return {
    attentionItems: attentionItems.slice(0, 5),
    opportunityBrief: buildBusinessOpportunityBrief(candidates),
  };
}
