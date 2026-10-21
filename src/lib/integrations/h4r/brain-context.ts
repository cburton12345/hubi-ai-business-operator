import crypto from "node:crypto";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { assertCompanionActionPermitted, homes4RentCompanionContract } from "@/lib/integrations/companion-product-contract";
import { captureH4rGoalObservation } from "./goal-observation";

const count = z.number().int().nonnegative();
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metricsSchema = z.object({
  activeProperties: count, activeUnits: count, activeTenants: count, trackedLeases: count,
  leasesNotFullySigned: count, outstandingBalanceCents: cents, pastDueUnits: count,
  openCollectionCases: count, collectionBalanceCents: cents, openOwnerNotifications: count,
  urgentOwnerNotifications: count, activeDocuments: count, providerIssues: count,
});

export const h4rBrainContextSchema = z.object({
  ok: z.literal(true), mode: z.literal("read_only"), schema_version: z.literal(1), product_key: z.literal("h4r"),
  workspace_id: z.string().uuid(), generated_at: z.string().datetime({ offset: true }), metrics: metricsSchema,
  domain_state: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  authority_map: z.record(z.string(), z.unknown()), capabilities: z.record(z.string(), z.string()),
  blind_spots: z.array(z.string().max(500)).max(50),
});

export type H4rBrainContext = z.infer<typeof h4rBrainContextSchema>;
export type H4rBrainContextSyncResult = {
  configured: boolean;
  mappingsChecked: number;
  captured: number;
  reused: number;
  failed: number;
  goalsObserved: number;
};

function allowedContextUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch { return false; }
}

function sourceHash(context: H4rBrainContext) {
  return crypto.createHash("sha256").update(JSON.stringify({
    schemaVersion: context.schema_version, workspaceId: context.workspace_id, metrics: context.metrics,
    domainState: context.domain_state, capabilities: context.capabilities, blindSpots: context.blind_spots,
  })).digest("hex");
}

async function fetchContext(workspaceId: string) {
  const url = env.H4R_CONTEXT_URL;
  const secret = env.H4R_SMS_BRIDGE_SECRET;
  if (!url || !secret || !allowedContextUrl(url)) throw new Error("H4R brain context is not configured.");
  assertCompanionActionPermitted({ productKey: "h4r", actionKey: "read_context", requestedMode: "read" });
  const rawBody = JSON.stringify({ workspace_id: workspaceId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`, "utf8").digest("hex");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-h4r-timestamp": timestamp, "x-h4r-nonce": nonce, "x-h4r-signature": `sha256=${signature}` },
    body: rawBody,
    signal: AbortSignal.timeout(20_000),
  });
  const rawResponse = await response.text();
  if (rawResponse.length > 262_144) throw new Error("H4R returned an oversized brain-context snapshot.");
  let payload: unknown = {};
  try { payload = JSON.parse(rawResponse); } catch { payload = {}; }
  if (!response.ok) throw new Error(`H4R brain context returned HTTP ${response.status}.`);
  const parsed = h4rBrainContextSchema.safeParse(payload);
  if (!parsed.success || parsed.data.workspace_id !== workspaceId) throw new Error("H4R returned an invalid or mismatched brain-context snapshot.");
  return parsed.data;
}

async function recordDomainObservation(input: {
  tenantId: string; snapshotId: string; context: H4rBrainContext; domain: string; active: boolean;
  title: string; summary: string; severity: "low" | "medium" | "high" | "critical"; moneyCents?: number; riskType: string;
  ownerAttention?: boolean;
}) {
  const hash = sourceHash(input.context);
  const requiresOwner = input.active && input.ownerAttention === true;
  const status = input.active ? (requiresOwner ? "needs_owner" as const : "open" as const) : "resolved" as const;
  const result = await captureH4rGoalObservation({
    tenantId: input.tenantId,
    externalEventId: `h4r-context:${input.context.workspace_id}:${input.domain}:${hash.slice(0, 16)}:${input.context.generated_at}`,
    eventType: `context.${input.domain}.${input.active ? "attention" : "clear"}`,
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    status,
    ownerAttention: requiresOwner,
    occurredAt: input.context.generated_at,
    moneyCents: input.moneyCents ?? 0,
    riskType: input.riskType,
    recommendedAction: input.active ? "Open the authoritative Homes4Rent record and let Ferocity prepare the next approval-safe step." : null,
    metadata: {
      sourceWorkspaceId: input.context.workspace_id,
      contextDomain: input.domain,
      companionSnapshotId: input.snapshotId,
      authoritativeSystem: "h4r",
      authoritativeOutcomeVerified: !input.active,
      outcomeEvidence: !input.active ? { sourceHash: hash, observedAt: input.context.generated_at, domain: input.domain, state: "clear" } : null,
    },
  });
  return result.captured;
}

async function observeMaterialContext(tenantId: string, snapshotId: string, context: H4rBrainContext) {
  const metrics = context.metrics;
  const observations = await Promise.all([
    recordDomainObservation({
      tenantId, snapshotId, context, domain: "collections",
      active: metrics.openCollectionCases > 0 || metrics.pastDueUnits > 0,
      title: metrics.openCollectionCases > 0 || metrics.pastDueUnits > 0 ? "Homes4Rent balances need follow-through" : "Homes4Rent balance follow-through is clear",
      summary: metrics.openCollectionCases > 0 || metrics.pastDueUnits > 0
        ? `${metrics.openCollectionCases} collection case(s) and ${metrics.pastDueUnits} past-due unit(s) remain in authoritative H4R records.`
        : "H4R reports no open collection cases or past-due units in the aggregate context.",
      severity: metrics.collectionBalanceCents >= 100_000 || metrics.pastDueUnits > 0 ? "high" : "medium",
      moneyCents: Math.max(metrics.collectionBalanceCents, metrics.outstandingBalanceCents), riskType: "financial",
    }),
    recordDomainObservation({
      tenantId, snapshotId, context, domain: "owner_attention", active: metrics.urgentOwnerNotifications > 0,
      title: metrics.urgentOwnerNotifications > 0 ? "Homes4Rent has urgent owner items" : "Homes4Rent urgent owner queue is clear",
      summary: metrics.urgentOwnerNotifications > 0
        ? `${metrics.urgentOwnerNotifications} urgent H4R notification(s) require judgment; detailed records remain in H4R.`
        : "H4R reports no urgent owner notifications in the aggregate context.",
      severity: metrics.urgentOwnerNotifications > 0 ? "critical" : "low", riskType: "approval",
      ownerAttention: true,
    }),
    recordDomainObservation({
      tenantId, snapshotId, context, domain: "providers", active: metrics.providerIssues > 0,
      title: metrics.providerIssues > 0 ? "Homes4Rent provider connections need attention" : "Homes4Rent provider connections are clear",
      summary: metrics.providerIssues > 0
        ? `${metrics.providerIssues} H4R provider connection(s) report a warning, error, pause, or offline state.`
        : "H4R reports no provider connection issues in the aggregate context.",
      severity: metrics.providerIssues > 0 ? "high" : "low", riskType: "automation",
    }),
  ]);
  return observations.filter(Boolean).length;
}

export async function syncH4rBrainContextForTenant(tenantId: string): Promise<H4rBrainContextSyncResult> {
  const result: H4rBrainContextSyncResult = { configured: Boolean(env.H4R_CONTEXT_URL && env.H4R_SMS_BRIDGE_SECRET), mappingsChecked: 0, captured: 0, reused: 0, failed: 0, goalsObserved: 0 };
  if (!result.configured || !env.H4R_CONTEXT_URL || !allowedContextUrl(env.H4R_CONTEXT_URL)) return result;
  const mappings = await queryPostgres<{ h4r_workspace_id: string }>(
    `select h4r_workspace_id::text from public.h4r_ferocity_bridge_workspaces
     where ferocity_tenant_id=$1 and status in ('shadow','review','active') order by created_at`, [tenantId],
  );
  for (const mapping of mappings?.rows ?? []) {
    result.mappingsChecked += 1;
    try {
      const context = await fetchContext(mapping.h4r_workspace_id);
      const hash = sourceHash(context);
      const previous = await queryPostgres<{ source_hash: string }>(
        `select source_hash from public.companion_product_context_snapshots
         where tenant_id=$1 and product_key='h4r' and external_workspace_id=$2 and status='captured'
         order by source_generated_at desc limit 1`, [tenantId, context.workspace_id],
      );
      if (previous?.rows[0]?.source_hash === hash) { result.reused += 1; continue; }
      const inserted = await queryPostgres<{ id: string }>(
        `insert into public.companion_product_context_snapshots (
           tenant_id,product_key,external_workspace_id,schema_version,source_generated_at,source_hash,
           metrics_json,domain_state_json,capabilities_json,blind_spots_json,metadata_json
         ) values ($1,'h4r',$2,$3,$4::timestamptz,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
         on conflict (tenant_id,product_key,external_workspace_id,source_generated_at,source_hash) do nothing returning id`,
        [tenantId, context.workspace_id, context.schema_version, context.generated_at, hash,
          JSON.stringify(context.metrics), JSON.stringify(context.domain_state), JSON.stringify(context.capabilities), JSON.stringify(context.blind_spots),
          JSON.stringify({ authorityRule: homes4RentCompanionContract.authorityRule, aggregateOnly: true, containsSourceCredentials: false })],
      );
      const snapshotId = inserted?.rows[0]?.id;
      if (!snapshotId) { result.reused += 1; continue; }
      result.captured += 1;
      result.goalsObserved += await observeMaterialContext(tenantId, snapshotId, context);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

export async function getLatestCompanionContextSummaryForAi(tenantId: string) {
  const result = await queryPostgres<{
    product_key: string; external_workspace_id: string; source_generated_at: Date;
    metrics_json: H4rBrainContext["metrics"]; capabilities_json: Record<string, unknown>; blind_spots_json: string[];
  }>(
    `select distinct on (product_key,external_workspace_id)
       product_key,external_workspace_id,source_generated_at,metrics_json,capabilities_json,blind_spots_json
     from public.companion_product_context_snapshots
     where tenant_id=$1 and status='captured'
     order by product_key,external_workspace_id,source_generated_at desc`, [tenantId],
  );
  return (result?.rows ?? []).map((snapshot) => {
    if (snapshot.product_key !== "h4r") {
      return `${snapshot.product_key} is an authoritative companion product. Use its adapter and do not infer write authority from this context.`;
    }
    const metrics = metricsSchema.safeParse(snapshot.metrics_json);
    if (!metrics.success) return "Homes4Rent is connected, but its latest aggregate context did not validate. Treat H4R as authoritative and request a safe refresh.";
    const value = metrics.data;
    return [
      `Homes4Rent authoritative context (${snapshot.external_workspace_id}, observed ${new Date(snapshot.source_generated_at).toISOString()}):`,
      `${value.activeProperties} active properties, ${value.activeUnits} active units, ${value.activeTenants} active tenants, ${value.trackedLeases} tracked leases, ${value.leasesNotFullySigned} not fully signed.`,
      `${value.pastDueUnits} past-due units, ${value.openCollectionCases} open collection cases, ${value.collectionBalanceCents} cents in open collection balances, ${value.outstandingBalanceCents} cents in aggregate positive unit balances.`,
      `${value.openOwnerNotifications} open owner notifications (${value.urgentOwnerNotifications} urgent), ${value.providerIssues} provider issues, ${value.activeDocuments} active documents.`,
      "H4R owns every underlying record. Never claim a tenant, payment, ledger, lease, notice, or signature changed unless an authorized H4R adapter returns verified outcome evidence.",
      snapshot.blind_spots_json.length ? `Declared blind spots: ${snapshot.blind_spots_json.join(" ")}` : "",
    ].filter(Boolean).join(" ");
  }).join("\n").slice(0, 6000);
}
