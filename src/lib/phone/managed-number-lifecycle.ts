import { randomUUID } from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import { env } from "@/lib/env";
import { raisePlatformAdminAlert, resolvePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { decideManagedNumberLifecycle, planIncludesManagedNumber, type NumberLifecycleAction } from "@/lib/phone/number-lifecycle-policy";
import {
  configureRetellManagedNumber,
  provisionRetellManagedNumber,
  releaseRetellManagedNumber,
  type ManagedNumberBinding
} from "@/lib/phone/retell-managed-number-provider";

type LifecycleRow = {
  tenant_id: string;
  tenant_name: string;
  brand_id: string | null;
  connection_id: string;
  connection_path: string;
  connection_status: string;
  preferred_area_code: string | null;
  human_transfer_number: string | null;
  provisioning_approved: boolean;
  activation_key: string;
  plan_key: string | null;
  subscription_status: string | null;
  current_period_end: Date | string | null;
  billing_past_due_since: string | null;
  number_id: string | null;
  phone_number: string | null;
  number_status: string | null;
  callback_status: string | null;
  retention_started_at: Date | string | null;
  retain_until: Date | string | null;
  port_out_requested_at: Date | string | null;
  release_requested_at: Date | string | null;
  inbound_assistant_id: string | null;
  outbound_assistant_id: string | null;
  assistant_transfer_number: string | null;
  provider_account_ready: boolean;
};

export type ManagedNumberLifecycleResult = {
  tenantId: string;
  action: NumberLifecycleAction | "gated" | "awaiting_voice_agents" | "awaiting_transfer_destination";
  status: "unchanged" | "queued" | "completed" | "blocked";
  reason: string;
  phoneNumber?: string | null;
};

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function lifecycleEnabled() {
  return env.FEROCITY_MANAGED_NUMBER_LIFECYCLE_ENABLED === "true";
}

async function loadLifecycleRow(tenantId: string): Promise<LifecycleRow | null> {
  const result = await queryPostgres<LifecycleRow>(
    `select t.id tenant_id,t.name tenant_name,pc.brand_id,pc.id connection_id,pc.connection_path,
            pc.status connection_status,pc.preferred_area_code,pc.human_transfer_number,
            coalesce((pc.setup_json->>'managedNumberProvisioningApproved')::boolean,false) provisioning_approved,
            coalesce(pc.setup_json->>'customerSelectedAt',pc.created_at::text) activation_key,
            s.plan_key,s.status subscription_status,s.current_period_end,s.metadata_json->>'billingPastDueSince' billing_past_due_since,
            n.id number_id,n.phone_number,n.status number_status,n.callback_status,n.retention_started_at,
            n.retain_until,n.port_out_requested_at,n.release_requested_at,
            nullif(pa.metadata_json->>'assistantId','') inbound_assistant_id,
            nullif(pa.metadata_json->>'outboundAssistantId','') outbound_assistant_id,
            nullif(pa.metadata_json->>'transferNumber','') assistant_transfer_number,
            (pa.status in ('connected','paused') and pa.credentials_status='configured') provider_account_ready
       from public.phone_connections pc
       join public.tenants t on t.id=pc.tenant_id
       left join public.billing_subscriptions s on s.tenant_id=pc.tenant_id
       left join public.provider_accounts pa on pa.tenant_id=pc.tenant_id and pa.provider_key='retell_voice'
       left join lateral (
         select * from public.telephony_numbers n0
          where n0.tenant_id=pc.tenant_id and n0.provider_key='retell_voice' and n0.number_mode='ferocity_managed'
          order by case n0.status when 'active' then 0 when 'paused' then 1 when 'provisioning' then 2 else 3 end,n0.created_at desc
          limit 1
       ) n on true
      where pc.tenant_id=$1
      limit 1`,
    [tenantId]
  );
  return result?.rows[0] ?? null;
}

async function recordOwnerEvent(row: LifecycleRow, key: string, title: string, summary: string, severity: "info" | "medium" | "high", needsOwner: boolean) {
  await queryPostgres(
    `insert into public.owner_command_events (
       tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,
       owner_attention,ai_handled,recommended_action,action_href,risk_type,confidence_score,metadata_json
     ) values ($1,'ferocity','Ferocity',$2,'phone.number_lifecycle',$3,$4,$5,$6,$7,$8,$9,'/app/receptionist-setup','operations',100,$10::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do update
       set title=excluded.title,summary=excluded.summary,severity=excluded.severity,status=excluded.status,
           owner_attention=excluded.owner_attention,ai_handled=excluded.ai_handled,
           recommended_action=excluded.recommended_action,metadata_json=public.owner_command_events.metadata_json||excluded.metadata_json,
           updated_at=now()`,
    [row.tenant_id, key, title, summary, severity, needsOwner ? "needs_owner" : "resolved", needsOwner, !needsOwner,
      needsOwner ? "Open Receptionist Setup and review the phone-number status." : "No action is required.",
      JSON.stringify({ phoneNumber: row.phone_number, connectionId: row.connection_id })]
  );
  if (needsOwner) {
    await sendWorkspacePushNotifications({
      tenantId: row.tenant_id,
      eventType: "phone.number_lifecycle",
      title,
      body: summary,
      url: "/app/receptionist-setup",
      tag: `phone-lifecycle-${key}`,
      metadata: { phoneNumber: row.phone_number }
    });
  }
}

async function claimJob(row: LifecycleRow, action: Exclude<NumberLifecycleAction, "none" | "retain">) {
  const lifecycleOccurrence = action === "provision"
    ? row.activation_key
    : action === "restrict"
      ? row.billing_past_due_since ?? iso(row.retain_until) ?? row.activation_key
      : action === "restore"
        ? iso(row.current_period_end) ?? row.subscription_status ?? row.activation_key
        : action === "hold_for_port_out"
          ? iso(row.port_out_requested_at) ?? row.activation_key
          : iso(row.retain_until) ?? row.activation_key;
  const idempotencyKey = `managed-number:${row.connection_id}:${action}:${lifecycleOccurrence}`;
  const inserted = await queryPostgres<{ id: string; status: string }>(
    `insert into public.phone_number_lifecycle_jobs (
       tenant_id,phone_connection_id,telephony_number_id,provider_key,action,idempotency_key,metadata_json
     ) values ($1,$2,$3,'retell_voice',$4,$5,$6::jsonb)
     on conflict (idempotency_key) do update set updated_at=now()
     returning id,status`,
    [row.tenant_id, row.connection_id, row.number_id, action, idempotencyKey,
      JSON.stringify({ activationKey: row.activation_key, phoneNumber: row.phone_number })]
  );
  const job = inserted?.rows[0];
  if (!job || job.status === "completed" || job.status === "blocked") return null;
  const claimed = await queryPostgres<{ id: string }>(
    `update public.phone_number_lifecycle_jobs set status='processing',attempt_count=attempt_count+1,
       started_at=now(),updated_at=now()
     where id=$1 and status in ('queued','retrying') and scheduled_for<=now()
     returning id`,
    [job.id]
  );
  return claimed?.rows[0]?.id ?? null;
}

async function finishJob(jobId: string, input: { status: "completed" | "retrying" | "blocked"; resourceId?: string | null; error?: string | null }) {
  await queryPostgres(
    `update public.phone_number_lifecycle_jobs set status=$2,provider_resource_id=coalesce($3,provider_resource_id),
       safe_error_message=$4,scheduled_for=case when $2='retrying' then now()+interval '15 minutes' else scheduled_for end,
       completed_at=case when $2='completed' then now() else completed_at end,updated_at=now() where id=$1`,
    [jobId, input.status, input.resourceId ?? null, input.error ?? null]
  );
}

function providerContext(row: LifecycleRow, action: string) {
  return {
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    correlationId: randomUUID(),
    idempotencyKey: `managed-number:${row.connection_id}:${action}:${row.activation_key}`,
    liveActionsEnabled: lifecycleEnabled(),
    purpose: "production" as const
  };
}

function binding(row: LifecycleRow): ManagedNumberBinding | null {
  if (!row.inbound_assistant_id || !row.outbound_assistant_id) return null;
  const appUrl = (env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  return {
    inboundAssistantId: row.inbound_assistant_id,
    outboundAssistantId: row.outbound_assistant_id,
    inboundWebhookUrl: `${appUrl}/api/integrations/voice-ai/inbound`,
    nickname: `${row.tenant_name} — Ferocity managed`,
    areaCode: row.preferred_area_code
  };
}

async function block(row: LifecycleRow, jobId: string, action: string, message: string) {
  await finishJob(jobId, { status: "blocked", error: message });
  await queryPostgres(
    `update public.phone_connections set status='needs_attention',setup_json=setup_json||$2::jsonb,updated_at=now() where id=$1`,
    [row.connection_id, JSON.stringify({ lifecycleError: message, lifecycleAction: action, lifecycleFailedAt: new Date().toISOString() })]
  );
  await raisePlatformAdminAlert({
    fingerprint: `managed-number:${row.tenant_id}:${action}`,
    family: "voice_provider",
    type: "managed_number_lifecycle_blocked",
    severity: "high",
    title: `Managed phone number needs attention: ${row.tenant_name}`,
    body: message,
    tenantId: row.tenant_id,
    actionUrl: "/app/platform-activity",
    metadata: { action, phoneNumber: row.phone_number }
  });
  await recordOwnerEvent(row, `managed-number:${action}:${row.activation_key}`, "Your phone setup needs attention", message, "high", true);
  return { tenantId: row.tenant_id, action: action as NumberLifecycleAction, status: "blocked" as const, reason: message, phoneNumber: row.phone_number };
}

export async function reconcileManagedNumberLifecycleForTenant(tenantId: string): Promise<ManagedNumberLifecycleResult> {
  const row = await loadLifecycleRow(tenantId);
  if (!row) return { tenantId, action: "none", status: "unchanged", reason: "No phone connection is configured." };
  const planEligible = planIncludesManagedNumber(row.plan_key);
  const hasManagedNumber = Boolean(row.number_id && row.phone_number && row.number_status !== "released");
  if (!planEligible && !hasManagedNumber) {
    return { tenantId, action: "none", status: "unchanged", reason: "The current plan does not include a Ferocity-managed number." };
  }
  const decision = decideManagedNumberLifecycle({
    connectionPath: row.connection_path,
    provisioningApproved: row.provisioning_approved,
    subscriptionStatus: planEligible ? row.subscription_status : "cancelled",
    currentPeriodEnd: iso(row.current_period_end),
    billingPastDueSince: row.billing_past_due_since,
    retentionStartedAt: iso(row.retention_started_at),
    retainUntil: iso(row.retain_until),
    numberStatus: row.number_status,
    hasManagedNumber,
    portOutRequested: Boolean(row.port_out_requested_at)
  });
  if (decision.action === "none" || decision.action === "retain") {
    if (row.number_id) {
      await queryPostgres(
        `update public.telephony_numbers set last_lifecycle_reconciled_at=now(),
           retain_until=coalesce(retain_until,$2::timestamptz),updated_at=now() where id=$1`,
        [row.number_id, decision.retainUntil]
      );
    }
    return { tenantId, action: decision.action, status: "unchanged", reason: decision.reason, phoneNumber: row.phone_number };
  }
  if (!lifecycleEnabled()) {
    return { tenantId, action: "gated", status: "unchanged", reason: "Managed-number provider actions are staged but not enabled.", phoneNumber: row.phone_number };
  }
  if (
    !row.human_transfer_number
    || !/^\+[1-9]\d{7,14}$/.test(row.human_transfer_number)
    || row.assistant_transfer_number !== row.human_transfer_number
  ) {
    return {
      tenantId,
      action: "awaiting_transfer_destination",
      status: "unchanged",
      reason: "Save a verified E.164 transfer number and resync the workspace voice agents before provisioning.",
      phoneNumber: row.phone_number
    };
  }
  if (!row.provider_account_ready || !binding(row)) {
    return { tenantId, action: "awaiting_voice_agents", status: "unchanged", reason: "Create and verify the workspace voice agents before provisioning its number.", phoneNumber: row.phone_number };
  }
  const jobId = await claimJob(row, decision.action);
  if (!jobId) return { tenantId, action: decision.action, status: "unchanged", reason: "The lifecycle action is already complete or requires operator review.", phoneNumber: row.phone_number };
  const numberBinding = binding(row)!;

  if (decision.action === "provision") {
    // Provision is intentionally not retried automatically after an uncertain
    // provider response; buying the same number twice is worse than review.
    const result = await provisionRetellManagedNumber(providerContext(row, "provision"), numberBinding);
    if (!result.ok) return block(row, jobId, "provision", result.safeMessage);
    const stored = await withPostgresTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into public.telephony_numbers (
           tenant_id,brand_id,provider_key,number_mode,phone_number,display_name,provider_resource_id,status,
           inbound_enabled,outbound_enabled,compliance_status,routing_json,metadata_json,activated_at,last_lifecycle_reconciled_at
         ) values ($1,$2,'retell_voice','ferocity_managed',$3,$4,$3,'active',true,false,'ready',$5::jsonb,$6::jsonb,now(),now())
         on conflict (tenant_id,phone_number) do update set status='active',inbound_enabled=true,
           provider_resource_id=excluded.provider_resource_id,activated_at=coalesce(public.telephony_numbers.activated_at,now()),
           lifecycle_error=null,last_lifecycle_reconciled_at=now(),updated_at=now()
         returning id`,
        [row.tenant_id, row.brand_id, result.data.phoneNumber, `${row.tenant_name} phone`,
          JSON.stringify({ inboundWebhookUrl: numberBinding.inboundWebhookUrl, humanTransferNumber: row.human_transfer_number }),
          JSON.stringify({ providerType: result.data.providerType, provisionedBy: "managed_number_lifecycle" })]
      );
      await client.query(
        `update public.phone_connections set ferocity_number=$2,phone_provider_key='retell_voice',
           phone_provider_label='Ferocity-managed Retell',voice_agent_provider_key='retell_voice',status='testing',
           setup_json=setup_json||$3::jsonb,updated_at=now() where id=$1`,
        [row.connection_id, result.data.phoneNumber, JSON.stringify({ provisionedAt: new Date().toISOString(), callbackCertificationRequired: true })]
      );
      return inserted.rows[0]?.id ?? null;
    });
    if (!stored) return block(row, jobId, "provision", "The provider created the number, but Ferocity could not safely finish its local assignment. Operator reconciliation is required; no second number will be purchased automatically.");
    await queryPostgres(`update public.phone_number_lifecycle_jobs set telephony_number_id=$2 where id=$1`, [jobId, stored]);
    await finishJob(jobId, { status: "completed", resourceId: result.data.providerResourceId });
    await resolvePlatformAdminAlert(`managed-number:${row.tenant_id}:provision`);
    await recordOwnerEvent({ ...row, phone_number: result.data.phoneNumber }, `managed-number:provisioned:${row.activation_key}`, "Your Ferocity number is ready to test", `${result.data.phoneNumber} is assigned to your workspace. Complete the guided call and callback test before outbound customer calls are enabled.`, "info", true);
    return { tenantId, action: "provision", status: "completed", reason: "Managed number provisioned and bound; callback certification remains required.", phoneNumber: result.data.phoneNumber };
  }

  if (decision.action === "restrict" || decision.action === "restore") {
    const result = await configureRetellManagedNumber(providerContext(row, decision.action), row.phone_number!, numberBinding, decision.action === "restore" ? "active" : "restricted");
    if (!result.ok) return block(row, jobId, decision.action, result.safeMessage);
    await queryPostgres(
      `update public.telephony_numbers set status=$2,inbound_enabled=true,
         outbound_enabled=case when $2='active' and callback_status='certified' then true else false end,
         billing_restricted_at=case when $2='paused' then coalesce(billing_restricted_at,now()) else null end,
         retention_started_at=case when $2='paused' then coalesce(retention_started_at,now()) else null end,
         retain_until=case when $2='paused' then $3::timestamptz else null end,
         lifecycle_error=null,last_lifecycle_reconciled_at=now(),updated_at=now() where id=$1`,
      [row.number_id, decision.action === "restore" ? "active" : "paused", decision.retainUntil]
    );
    await queryPostgres(
      `update public.phone_connections set status=$2,setup_json=setup_json||$3::jsonb,updated_at=now() where id=$1`,
      [row.connection_id, decision.action === "restore" ? "active" : "paused", JSON.stringify({ lifecycleAction: decision.action, lifecycleAt: new Date().toISOString(), retainUntil: decision.retainUntil })]
    );
    await finishJob(jobId, { status: "completed", resourceId: row.phone_number });
    await resolvePlatformAdminAlert(`managed-number:${row.tenant_id}:${decision.action}`);
    await recordOwnerEvent(row, `managed-number:${decision.action}:${row.activation_key}`, decision.action === "restore" ? "Your Ferocity phone service was restored" : "Your number is protected while billing is resolved", decision.action === "restore" ? "Payment recovered and managed calling was restored automatically." : `Outbound calling is paused. Ferocity will preserve the number until ${new Date(decision.retainUntil!).toLocaleDateString("en-US")} for recovery or port-out.`, decision.action === "restore" ? "info" : "high", decision.action !== "restore");
    return { tenantId, action: decision.action, status: "completed", reason: decision.reason, phoneNumber: row.phone_number };
  }

  if (decision.action === "hold_for_port_out") {
    await queryPostgres(
      `update public.telephony_numbers set status='needs_attention',outbound_enabled=false,
         retain_until=greatest(coalesce(retain_until,now()),now()+interval '30 days'),last_lifecycle_reconciled_at=now(),updated_at=now()
       where id=$1`,
      [row.number_id]
    );
    await finishJob(jobId, { status: "completed", resourceId: row.phone_number });
    await raisePlatformAdminAlert({
      fingerprint: `managed-number:${row.tenant_id}:port-out`, family: "voice_provider", type: "number_port_out_requested",
      severity: "high", title: `Number port-out requested: ${row.tenant_name}`,
      body: `${row.phone_number} must not be automatically released. Coordinate the verified port-out request.`,
      tenantId: row.tenant_id, actionUrl: "/app/platform-activity", metadata: { phoneNumber: row.phone_number }
    });
    return { tenantId, action: decision.action, status: "completed", reason: decision.reason, phoneNumber: row.phone_number };
  }

  if (!row.release_requested_at) {
    await queryPostgres(
      `update public.telephony_numbers set release_requested_at=now(),status='needs_attention',
         outbound_enabled=false,last_lifecycle_reconciled_at=now(),updated_at=now()
       where id=$1 and port_out_requested_at is null`,
      [row.number_id]
    );
    await finishJob(jobId, { status: "retrying", resourceId: row.phone_number, error: "Final release is delayed for a last port-out safety window." });
    await queryPostgres(
      `update public.phone_number_lifecycle_jobs set scheduled_for=now()+interval '24 hours' where id=$1`,
      [jobId]
    );
    await recordOwnerEvent(row, `managed-number:release-warning:${row.activation_key}`, "Your managed number is scheduled for release", `${row.phone_number} is scheduled for release after a final 24-hour safety window. Restore billing or request port-out now to keep it.`, "high", true);
    return { tenantId, action: "release", status: "queued", reason: "Final release warning issued; a 24-hour port-out safety window remains.", phoneNumber: row.phone_number };
  }
  const fresh = await loadLifecycleRow(tenantId);
  if (!fresh || fresh.port_out_requested_at) {
    await finishJob(jobId, { status: "completed", resourceId: row.phone_number });
    return { tenantId, action: "hold_for_port_out", status: "completed", reason: "Automatic release was cancelled by a port-out request.", phoneNumber: row.phone_number };
  }
  const released = await releaseRetellManagedNumber(providerContext(row, "release"), row.phone_number!);
  if (!released.ok) return block(row, jobId, "release", released.safeMessage);
  await queryPostgres(
    `update public.telephony_numbers set status='released',inbound_enabled=false,outbound_enabled=false,
       release_requested_at=coalesce(release_requested_at,now()),released_at=now(),last_lifecycle_reconciled_at=now(),
       lifecycle_error=null,updated_at=now() where id=$1 and port_out_requested_at is null`,
    [row.number_id]
  );
  await queryPostgres(
    `update public.phone_connections set status='paused',setup_json=setup_json||$2::jsonb,updated_at=now() where id=$1`,
    [row.connection_id, JSON.stringify({ managedNumberReleasedAt: new Date().toISOString(), releasedNumber: row.phone_number })]
  );
  await finishJob(jobId, { status: "completed", resourceId: row.phone_number });
  await recordOwnerEvent(row, `managed-number:released:${row.activation_key}`, "Your managed phone number was released", `${row.phone_number} was released after the protected recovery and port-out period ended.`, "info", false);
  return { tenantId, action: "release", status: "completed", reason: decision.reason, phoneNumber: row.phone_number };
}

export async function reconcileManagedNumberLifecycles(input: { tenantId?: string | null; limit?: number } = {}) {
  const tenants = input.tenantId
    ? [{ tenant_id: input.tenantId }]
    : (await queryPostgres<{ tenant_id: string }>(
        `select pc.tenant_id from public.phone_connections pc
         left join public.telephony_numbers n on n.tenant_id=pc.tenant_id and n.number_mode='ferocity_managed' and n.status<>'released'
         where pc.connection_path='new_ferocity_number'
           and (coalesce((pc.setup_json->>'managedNumberProvisioningApproved')::boolean,false) or n.id is not null)
         order by pc.updated_at limit $1`,
        [Math.max(1, Math.min(input.limit ?? 25, 100))]
      ))?.rows ?? [];
  const results: ManagedNumberLifecycleResult[] = [];
  for (const tenant of tenants) results.push(await reconcileManagedNumberLifecycleForTenant(tenant.tenant_id));
  return results;
}
