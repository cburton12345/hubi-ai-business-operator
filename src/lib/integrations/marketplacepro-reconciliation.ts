import "server-only";
import { queryPostgresRequired } from "@/lib/db/postgres";

type ReconciliationRow = {
  opportunity_id: string;
  opportunity_title: string;
  workflow_status: string;
  marketplacepro_status: string | null;
  marketplacepro_labor_request_id: string | null;
  contractor_confirmed: boolean;
  service_job_id: string | null;
  service_job_status: string | null;
  latest_match_status: string | null;
  latest_match_at: Date | string | null;
  latest_confirmation_status: string | null;
  latest_confirmation_at: Date | string | null;
  latest_assignment_status: string | null;
  latest_assignment_at: Date | string | null;
  latest_sync_status: string | null;
  latest_sync_at: Date | string | null;
  latest_sync_error: string | null;
};

export type MarketplaceProReconciliationItem = {
  opportunityId: string;
  opportunityTitle: string;
  ferocityStatus: string;
  marketplaceProStatus: string | null;
  laborRequestId: string | null;
  contractorConfirmed: boolean;
  serviceJobId: string | null;
  serviceJobStatus: string | null;
  matchStatus: string | null;
  confirmationStatus: string | null;
  assignmentStatus: string | null;
  lastSyncAt: string | null;
  state: "aligned" | "waiting" | "attention";
  reasons: string[];
};

const COMPLETED = new Set(["completed", "verified", "closed"]);

export function classifyMarketplaceProReconciliation(input: {
  ferocityStatus: string;
  contractorConfirmed: boolean;
  serviceJobId: string | null;
  serviceJobStatus: string | null;
  matchStatus: string | null;
  confirmationStatus: string | null;
  assignmentStatus: string | null;
  latestSyncStatus: string | null;
  latestSyncError: string | null;
}) {
  const reasons: string[] = [];
  const ferocityComplete = input.serviceJobStatus === "completed" || input.ferocityStatus === "closed";
  const marketplaceComplete = input.assignmentStatus ? COMPLETED.has(input.assignmentStatus) : false;

  if (input.latestSyncStatus === "failed" || input.latestSyncError) reasons.push("The latest MarketplacePro sync needs attention.");
  if (["contractor_confirmed", "ready_for_authorization", "accepted", "converted"].includes(input.ferocityStatus) && !input.contractorConfirmed) {
    reasons.push("Ferocity advanced beyond sourcing without confirmed contractor evidence.");
  }
  if (input.contractorConfirmed && !input.confirmationStatus) reasons.push("Ferocity records confirmation but no confirmation event is visible.");
  if (input.assignmentStatus && !input.serviceJobId && !["proposed", "pending", "declined", "rejected"].includes(input.assignmentStatus)) {
    reasons.push("MarketplacePro reports assignment progress without a linked Ferocity job.");
  }
  if (ferocityComplete && !marketplaceComplete) reasons.push("Ferocity reports completion but MarketplacePro has not reported a completed or verified assignment.");
  if (marketplaceComplete && !ferocityComplete) reasons.push("MarketplacePro reports completion but Ferocity has not completed the linked job.");

  if (reasons.length) return { state: "attention" as const, reasons };
  if (["closed", "converted"].includes(input.ferocityStatus) && ferocityComplete && marketplaceComplete) {
    return { state: "aligned" as const, reasons: ["MarketplacePro and Ferocity completion evidence agree."] };
  }
  if (input.contractorConfirmed && input.confirmationStatus) {
    return { state: "aligned" as const, reasons: ["Contractor confirmation evidence is synchronized."] };
  }
  if (input.matchStatus || ["sourcing", "recruiting", "contractor_identified"].includes(input.ferocityStatus)) {
    return { state: "waiting" as const, reasons: ["Sourcing is active; no binding assignment is inferred."] };
  }
  return { state: "waiting" as const, reasons: ["Waiting for MarketplacePro sourcing evidence."] };
}

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

export async function getMarketplaceProReconciliation(tenantId: string) {
  const result = await queryPostgresRequired<ReconciliationRow>(
    `
    select
      profile.opportunity_id,
      opportunity.title as opportunity_title,
      profile.workflow_status,
      profile.marketplacepro_status,
      profile.marketplacepro_labor_request_id::text,
      profile.contractor_confirmed,
      job.id as service_job_id,
      job.status as service_job_status,
      match_event.status as latest_match_status,
      match_event.created_at as latest_match_at,
      confirmation_event.status as latest_confirmation_status,
      confirmation_event.created_at as latest_confirmation_at,
      assignment_event.status as latest_assignment_status,
      assignment_event.created_at as latest_assignment_at,
      sync_event.sync_status as latest_sync_status,
      sync_event.created_at as latest_sync_at,
      case when sync_event.sync_status = 'failed' then sync_event.status_message else null end as latest_sync_error
    from public.maintenance_opportunity_profiles profile
    join public.opportunities opportunity
      on opportunity.tenant_id = profile.tenant_id and opportunity.id = profile.opportunity_id
    left join lateral (
      select service_job.id, service_job.status
      from public.service_jobs service_job
      where service_job.tenant_id = profile.tenant_id and service_job.opportunity_id = profile.opportunity_id
      order by service_job.created_at desc
      limit 1
    ) job on true
    left join lateral (
      select event.payload_json->>'status' as status, event.created_at
      from public.marketplacepro_sync_events event
      where event.tenant_id = profile.tenant_id
        and event.event_type = 'contractor_matches_found'
        and (
          event.payload_json->'payload'->>'externalOpportunityId' = profile.opportunity_id::text
          or event.payload_json->'payload'->>'laborRequestId' = profile.marketplacepro_labor_request_id::text
          or event.marketplace_object_id = profile.marketplacepro_labor_request_id::text
        )
      order by event.created_at desc, event.id desc
      limit 1
    ) match_event on true
    left join lateral (
      select event.payload_json->>'status' as status, event.created_at
      from public.marketplacepro_sync_events event
      where event.tenant_id = profile.tenant_id
        and event.event_type = 'contractor_confirmed'
        and (
          event.payload_json->'payload'->>'externalOpportunityId' = profile.opportunity_id::text
          or event.payload_json->'payload'->>'laborRequestId' = profile.marketplacepro_labor_request_id::text
          or event.marketplace_object_id = profile.marketplacepro_labor_request_id::text
        )
      order by event.created_at desc, event.id desc
      limit 1
    ) confirmation_event on true
    left join lateral (
      select event.payload_json->>'status' as status, event.created_at
      from public.marketplacepro_sync_events event
      where event.tenant_id = profile.tenant_id
        and event.event_type = 'assignment_status_changed'
        and (
          event.payload_json->'payload'->>'externalOpportunityId' = profile.opportunity_id::text
          or event.payload_json->'payload'->>'laborRequestId' = profile.marketplacepro_labor_request_id::text
          or event.marketplace_object_id = profile.marketplacepro_labor_request_id::text
        )
      order by event.created_at desc, event.id desc
      limit 1
    ) assignment_event on true
    left join lateral (
      select event.sync_status, event.status_message, event.created_at
      from public.marketplacepro_sync_events event
      where event.tenant_id = profile.tenant_id
        and (
          event.payload_json->'payload'->>'externalOpportunityId' = profile.opportunity_id::text
          or event.payload_json->'payload'->>'laborRequestId' = profile.marketplacepro_labor_request_id::text
          or event.marketplace_object_id = profile.marketplacepro_labor_request_id::text
        )
      order by event.created_at desc, event.id desc
      limit 1
    ) sync_event on true
    where profile.tenant_id = $1
      and profile.classification = 'commercial_maintenance'
    order by coalesce(sync_event.created_at, profile.updated_at) desc, profile.opportunity_id
    limit 100
    `,
    [tenantId],
    "marketplacepro-reconciliation"
  );

  const items: MarketplaceProReconciliationItem[] = result.rows.map((row) => {
    const classification = classifyMarketplaceProReconciliation({
      ferocityStatus: row.workflow_status,
      contractorConfirmed: row.contractor_confirmed,
      serviceJobId: row.service_job_id,
      serviceJobStatus: row.service_job_status,
      matchStatus: row.latest_match_status,
      confirmationStatus: row.latest_confirmation_status,
      assignmentStatus: row.latest_assignment_status,
      latestSyncStatus: row.latest_sync_status,
      latestSyncError: row.latest_sync_error
    });
    return {
      opportunityId: row.opportunity_id,
      opportunityTitle: row.opportunity_title,
      ferocityStatus: row.workflow_status,
      marketplaceProStatus: row.marketplacepro_status,
      laborRequestId: row.marketplacepro_labor_request_id,
      contractorConfirmed: row.contractor_confirmed,
      serviceJobId: row.service_job_id,
      serviceJobStatus: row.service_job_status,
      matchStatus: row.latest_match_status,
      confirmationStatus: row.latest_confirmation_status,
      assignmentStatus: row.latest_assignment_status,
      lastSyncAt: iso(row.latest_sync_at),
      state: classification.state,
      reasons: classification.reasons
    };
  });
  return {
    items,
    counts: {
      aligned: items.filter((item) => item.state === "aligned").length,
      waiting: items.filter((item) => item.state === "waiting").length,
      attention: items.filter((item) => item.state === "attention").length
    }
  };
}
