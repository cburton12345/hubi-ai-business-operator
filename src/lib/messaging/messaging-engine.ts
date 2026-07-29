import { queryPostgres } from "@/lib/db/postgres";
import { getServiceGate } from "@/lib/controls/service-gates";
import { getMessagingProvider, getProvidersForChannel } from "./provider-registry";
import type { MessagingSendInput, MessagingSendResult } from "./types";

function normalizeContact(value: string) {
  return value.trim().toLowerCase();
}

function fallbackProviderKey(input: MessagingSendInput) {
  if (input.channel === "email") return "resend_email";
  if (input.channel === "manual_sms") return "manual_sms";
  if (input.channel === "sms" || input.channel === "mms") return "twilio_sms";
  return "manual_sms";
}

function serviceFeatureForChannel(channel: MessagingSendInput["channel"]) {
  if (channel === "email") return "email_send";
  if (channel === "sms" || channel === "mms") return "sms_send";
  return null;
}

function hasSendAuthorization(input: MessagingSendInput) {
  return (
    ["internal", "app_push"].includes(input.channel)
    || Boolean(input.authorization?.humanApproved)
    || Boolean(input.authorization?.policyAllowsAuto)
  );
}

function configuredRate(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function estimatedMessagingUsage(input: MessagingSendInput) {
  if (input.channel === "email") {
    return { unitType: "email", units: 1, providerCostCents: configuredRate("EMAIL_PROVIDER_COST_CENTS", 0.1) };
  }
  if (input.channel === "mms") {
    return { unitType: "mms", units: 1, providerCostCents: configuredRate("MMS_PROVIDER_COST_CENTS", 3) };
  }
  const unicode = /[^\u0000-\u007f]/.test(input.body);
  const singleLimit = unicode ? 70 : 160;
  const multipartLimit = unicode ? 67 : 153;
  const units = input.body.length <= singleLimit ? 1 : Math.ceil(input.body.length / multipartLimit);
  return {
    unitType: "message",
    units,
    providerCostCents: units * configuredRate("SMS_SEGMENT_PROVIDER_COST_CENTS", 2)
  };
}

async function getMessagingSendDecision(input: MessagingSendInput, providerKey: string) {
  const featureKey = serviceFeatureForChannel(input.channel);
  if (featureKey) {
    const gate = await getServiceGate(input.tenantId, featureKey);
    if (!gate.enabled) return { allowed: false, reason: gate.reason, category: "service_gate" };
  }
  const result = await queryPostgres<{
    id: string;
    ownership_mode: string;
    emergency_paused: boolean;
    monthly_unit_cap: number | null;
    monthly_cost_cap_cents: number | null;
    hourly_send_cap: number | null;
    daily_send_cap: number | null;
    per_recipient_hourly_cap: number | null;
    recent_failure_cap: number | null;
    risk_window_minutes: number;
    used_units: string | number;
    used_cost_cents: string | number;
    hourly_sends: string | number;
    daily_sends: string | number;
    recipient_hourly_sends: string | number;
    recent_failures: string | number;
    external_emergency_paused: boolean;
  }>(
    `
    select
      a.id,
      a.ownership_mode,
      a.emergency_paused,
      a.monthly_unit_cap,
      a.monthly_cost_cap_cents,
      a.hourly_send_cap,
      a.daily_send_cap,
      a.per_recipient_hourly_cap,
      a.recent_failure_cap,
      a.risk_window_minutes,
      (
        select coalesce(sum(u.unit_count), 0)
        from public.messaging_usage u
        where u.tenant_id = a.tenant_id
          and u.provider_key = a.provider_key
          and u.created_at >= date_trunc('month', now())
      ) as used_units,
      (
        select coalesce(sum(u.provider_cost_cents), 0)
        from public.messaging_usage u
        where u.tenant_id = a.tenant_id
          and u.provider_key = a.provider_key
          and u.created_at >= date_trunc('month', now())
      ) as used_cost_cents,
      (
        select count(*)
        from public.messages m
        where m.tenant_id = a.tenant_id
          and m.provider_key = a.provider_key
          and m.direction = 'outbound'
          and m.status in ('queued', 'sent', 'delivered')
          and m.created_at >= now() - interval '1 hour'
      ) as hourly_sends,
      (
        select count(*)
        from public.messages m
        where m.tenant_id = a.tenant_id
          and m.provider_key = a.provider_key
          and m.direction = 'outbound'
          and m.status in ('queued', 'sent', 'delivered')
          and m.created_at >= now() - interval '1 day'
      ) as daily_sends,
      (
        select count(*)
        from public.messages m
        where m.tenant_id = a.tenant_id
          and m.provider_key = a.provider_key
          and m.direction = 'outbound'
          and m.status in ('queued', 'sent', 'delivered')
          and lower(m.to_value) = lower($3)
          and m.created_at >= now() - interval '1 hour'
      ) as recipient_hourly_sends,
      (
        select count(*)
        from public.messaging_provider_failures f
        where f.tenant_id = a.tenant_id
          and f.provider_key = a.provider_key
          and f.created_at >= now() - make_interval(mins => a.risk_window_minutes)
      ) as recent_failures,
      exists (
        select 1
        from public.spend_limits s
        where s.status = 'active'
          and s.emergency_paused = true
          and (
            (s.tenant_id is null and s.scope_type = 'global')
            or (
              s.tenant_id = a.tenant_id
              and (
                s.scope_type = 'tenant'
                or (s.scope_type = 'provider' and s.scope_key = a.provider_key)
                or (s.scope_type = 'feature' and s.scope_key = $4)
              )
            )
          )
      ) as external_emergency_paused
    from public.tenant_messaging_accounts a
    where a.tenant_id = $1
      and a.provider_key = $2
    order by
      case when a.connection_status = 'active' and a.live_sending_enabled and a.outbound_enabled then 0 else 1 end,
      case a.ownership_mode when 'customer_owned' then 0 when 'ferocity_managed' then 1 else 2 end
    limit 1
    `,
    [input.tenantId, providerKey, normalizeContact(input.to), featureKey]
  );
  const account = result?.rows[0];
  if (!account) {
    return {
      allowed: providerKey === "manual_sms",
      reason: providerKey === "manual_sms"
        ? "Manual messaging does not require a provider account."
        : "No tenant messaging account is configured for this provider.",
      category: "account_not_configured"
    };
  }
  if (account.emergency_paused || account.external_emergency_paused) {
    return {
      allowed: false,
      reason: "Messaging is emergency-paused for this workspace or provider.",
      category: "emergency_pause"
    };
  }

  const estimate = estimatedMessagingUsage(input);
  const usedUnits = Number(account.used_units ?? 0);
  const usedCostCents = Number(account.used_cost_cents ?? 0);
  if (account.monthly_unit_cap !== null && usedUnits + estimate.units > account.monthly_unit_cap) {
    return { allowed: false, reason: "Monthly messaging unit cap reached.", category: "unit_cap" };
  }
  if (account.monthly_cost_cap_cents !== null && usedCostCents + estimate.providerCostCents > account.monthly_cost_cap_cents) {
    return { allowed: false, reason: "Monthly messaging provider-cost cap reached.", category: "cost_cap" };
  }
  if (account.hourly_send_cap !== null && Number(account.hourly_sends ?? 0) >= account.hourly_send_cap) {
    return { allowed: false, reason: "Hourly messaging safety limit reached.", category: "hourly_velocity_cap" };
  }
  if (account.daily_send_cap !== null && Number(account.daily_sends ?? 0) >= account.daily_send_cap) {
    return { allowed: false, reason: "Daily messaging safety limit reached.", category: "daily_velocity_cap" };
  }
  if (
    account.per_recipient_hourly_cap !== null
    && Number(account.recipient_hourly_sends ?? 0) >= account.per_recipient_hourly_cap
  ) {
    return {
      allowed: false,
      reason: "This recipient has reached the hourly contact-frequency limit.",
      category: "recipient_frequency_cap"
    };
  }
  if (account.recent_failure_cap !== null && Number(account.recent_failures ?? 0) >= account.recent_failure_cap) {
    await queryPostgres(
      `
      update public.tenant_messaging_accounts
      set emergency_paused = true,
          live_sending_enabled = false,
          connection_status = 'blocked',
          metadata_json = metadata_json || $3::jsonb,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [
        input.tenantId,
        account.id,
        JSON.stringify({
          autoPausedBy: "messaging_failure_circuit_breaker",
          autoPausedAt: new Date().toISOString(),
          recentFailures: Number(account.recent_failures ?? 0),
          riskWindowMinutes: account.risk_window_minutes
        })
      ]
    );
    return {
      allowed: false,
      reason: "Messaging was isolated after repeated provider failures. Review the account before clearing the pause.",
      category: "failure_circuit_breaker"
    };
  }
  return {
    allowed: true,
    reason: "Messaging approval, account, emergency, velocity, and cost controls passed."
  };
}

async function hasRequiredConsent(input: MessagingSendInput) {
  if (["internal", "app_push"].includes(input.channel)) return true;
  const channel = ["manual_sms", "mms"].includes(input.channel) ? "sms" : input.channel;
  const contact = normalizeContact(input.to);
  const result = await queryPostgres<{ granted: boolean; revoked: boolean }>(
    `
    select
      (
        exists (
          select 1 from public.messaging_consents
          where tenant_id = $1 and contact_channel = $2
            and lower(contact_value) = $3 and status = 'granted'
        )
        or exists (
          select 1 from public.contact_consent_records
          where tenant_id = $1 and channel = $2
            and lower(contact_value) = $3 and status = 'granted'
        )
      ) as granted,
      (
        exists (
          select 1 from public.messaging_consents
          where tenant_id = $1 and contact_channel = $2
            and lower(contact_value) = $3 and status = 'revoked'
        )
        or exists (
          select 1 from public.contact_consent_records
          where tenant_id = $1 and channel = $2
            and lower(contact_value) = $3 and status in ('revoked', 'blocked')
        )
      ) as revoked
    `,
    [input.tenantId, channel, contact]
  );
  const consent = result?.rows[0];
  return Boolean(consent?.granted && !consent.revoked);
}

async function reserveIdempotentSend(input: MessagingSendInput, providerKey: string) {
  const idempotencyKey = input.idempotencyKey ?? (input.queueId ? `queue:${input.queueId}` : null);
  if (!idempotencyKey) return { acquired: true as const, idempotencyKey: null, previous: null };

  const inserted = await queryPostgres<{ id: string }>(
    `
    insert into public.messages (
      tenant_id, conversation_id, direction, channel, provider_key, from_value, to_value,
      subject, body, status, ai_generated, idempotency_key, metadata_json
    )
    values ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, 'queued', $9, $10, $11::jsonb)
    on conflict (tenant_id, idempotency_key) do nothing
    returning id
    `,
    [
      input.tenantId,
      input.conversationId ?? null,
      input.channel,
      providerKey,
      input.from ?? null,
      input.to,
      input.subject ?? null,
      input.body,
      Boolean(input.metadata?.aiGenerated),
      idempotencyKey,
      JSON.stringify({ ...(input.metadata ?? {}), queueId: input.queueId ?? null, engineReservation: true })
    ]
  );
  if (inserted?.rows[0]) return { acquired: true as const, idempotencyKey, previous: null };

  const previous = await queryPostgres<{ provider_message_ref: string | null; status: string; provider_key: string | null }>(
    `
    select provider_message_ref, status, provider_key
    from public.messages
    where tenant_id = $1 and idempotency_key = $2
    limit 1
    `,
    [input.tenantId, idempotencyKey]
  );
  return { acquired: false as const, idempotencyKey, previous: previous?.rows[0] ?? null };
}

async function isSuppressed(input: MessagingSendInput) {
  if (["internal", "app_push"].includes(input.channel)) return false;
  const channel = input.channel === "manual_sms" ? "sms" : input.channel;
  const contact = normalizeContact(input.to);
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.messaging_opt_outs
    where tenant_id = $1
      and contact_channel = $2
      and lower(contact_value) = $3
      and active = true
    limit 1
    `,
    [input.tenantId, channel, contact]
  );
  if (result?.rows[0]) return true;

  const legacy = await queryPostgres<{ id: string }>(
    `
    select id
    from public.contact_suppression_list
    where tenant_id = $1
      and channel = $2
      and lower(contact_value) = $3
      and active = true
    limit 1
    `,
    [input.tenantId, channel, contact]
  );
  return Boolean(legacy?.rows[0]);
}

async function logEngineFailure(input: MessagingSendInput, providerKey: string, result: Extract<MessagingSendResult, { ok: false }>) {
  await queryPostgres(
    `
    insert into public.messaging_provider_failures (
      tenant_id, provider_key, route_name, safe_error_category, safe_error_message, retryable, correlation_id, metadata_json
    )
    values ($1, $2, 'sendMessage', $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.tenantId,
      providerKey,
      typeof result.metadata?.blockedBy === "string"
        ? result.metadata.blockedBy
        : result.status === 0 ? "not_configured_or_blocked" : "provider_error",
      result.error,
      Boolean(result.retryable),
      input.idempotencyKey ?? input.queueId ?? null,
      JSON.stringify({ channel: input.channel, queueId: input.queueId ?? null, conversationId: input.conversationId ?? null })
    ]
  );
}

async function logMessage(input: MessagingSendInput, result: MessagingSendResult) {
  const idempotencyKey = input.idempotencyKey ?? (input.queueId ? `queue:${input.queueId}` : null);
  await queryPostgres(
    `
    insert into public.messages (
      tenant_id, conversation_id, direction, channel, provider_key, provider_message_ref,
      from_value, to_value, subject, body, status, ai_generated, idempotency_key, metadata_json, sent_at
    )
    values ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, case when $10 in ('sent','sent_manually') then now() else null end)
    on conflict (tenant_id, idempotency_key) do update set
      provider_message_ref = coalesce(excluded.provider_message_ref, public.messages.provider_message_ref),
      status = excluded.status,
      metadata_json = public.messages.metadata_json || excluded.metadata_json
    `,
    [
      input.tenantId,
      input.conversationId ?? null,
      input.channel,
      result.providerKey,
      result.ok ? result.providerMessageId : null,
      input.from ?? null,
      input.to,
      input.subject ?? null,
      input.body,
      result.ok ? (result.status === "manual_ready" ? "queued" : "sent") : "failed",
      Boolean(input.metadata?.aiGenerated),
      idempotencyKey,
      JSON.stringify({
        ...(input.metadata ?? {}),
        queueId: input.queueId ?? null,
        manualHref: result.ok ? result.manualHref ?? null : null,
        engineStatus: result.ok ? result.status : "failed"
      })
    ]
  );
}

async function logUsage(input: MessagingSendInput, result: MessagingSendResult) {
  if (!result.ok || result.status === "manual_ready") return;
  const estimate = estimatedMessagingUsage(input);
  const accountResult = await queryPostgres<{ ownership_mode: string }>(
    `
    select ownership_mode
    from public.tenant_messaging_accounts
    where tenant_id = $1 and provider_key = $2
    order by case ownership_mode when 'customer_owned' then 0 when 'ferocity_managed' then 1 else 2 end
    limit 1
    `,
    [input.tenantId, result.providerKey]
  );
  const managed = accountResult?.rows[0]?.ownership_mode === "ferocity_managed";
  const minimumUnitPrice = input.channel === "email" ? 0.2 : input.channel === "mms" ? 6 : 3;
  const customerChargeCents = managed
    ? Math.max(estimate.providerCostCents * 1.5, estimate.units * minimumUnitPrice)
    : 0;
  const usageResult = await queryPostgres<{ id: string }>(
    `
    insert into public.messaging_usage (
      tenant_id, provider_key, channel, direction, unit_type, unit_count, provider_cost_cents,
      customer_charge_cents, billing_status, metadata_json
    )
    values ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9::jsonb)
    returning id
    `,
    [
      input.tenantId,
      result.providerKey,
      input.channel,
      estimate.unitType,
      estimate.units,
      estimate.providerCostCents,
      customerChargeCents,
      managed ? "pending_review" : "included",
      JSON.stringify({
        queueId: input.queueId ?? null,
        providerMessageId: result.providerMessageId,
        costBasis: "conservative_estimate",
        ownershipMode: accountResult?.rows[0]?.ownership_mode ?? "unknown"
      })
    ]
  );
  const messagingUsageId = usageResult?.rows[0]?.id;
  const featureKey = serviceFeatureForChannel(input.channel);
  if (!messagingUsageId || !featureKey) return;

  const meterResult = await queryPostgres<{ id: string }>(
    `
    insert into public.usage_meter_events (
      tenant_id, feature_key, provider_key, provider_resource_id, provider_event_id,
      source_table, source_id, unit_type, quantity, provider_cost_cents,
      customer_charge_cents, status, source, idempotency_key, metadata_json
    )
    values (
      $1, $2, $3, nullif($4, ''), nullif($5, ''), 'messaging_usage', $6,
      $7, $8, $9, $10, $11, 'system', $12, $13::jsonb
    )
    on conflict (tenant_id, idempotency_key) do update
      set metadata_json = public.usage_meter_events.metadata_json || excluded.metadata_json
    returning id
    `,
    [
      input.tenantId,
      featureKey,
      result.providerKey,
      result.providerMessageId ?? "",
      result.providerMessageId ?? "",
      messagingUsageId,
      input.channel === "email" ? "email" : "message",
      estimate.units,
      estimate.providerCostCents,
      customerChargeCents,
      managed ? "pending_review" : "included",
      `messaging:${messagingUsageId}`,
      JSON.stringify({ channel: input.channel, costBasis: "conservative_estimate" })
    ]
  );
  const meterId = meterResult?.rows[0]?.id;
  if (!managed || !meterId || customerChargeCents <= 0) return;

  await queryPostgres(
    `
    insert into public.billing_usage_charges (
      tenant_id, charge_key, fee_family, description, source_table, source_id,
      amount_cents, status, period_start, period_end, metadata_json
    )
    values (
      $1, $2, 'usage_rebilling', $3, 'usage_meter_events', $4,
      ceil($5)::int, 'pending_review', date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month - 1 day',
      $6::jsonb
    )
    on conflict (tenant_id, charge_key, source_table, source_id)
      where source_table is not null and source_id is not null
    do nothing
    `,
    [
      input.tenantId,
      `${featureKey}:${meterId}`,
      `${estimate.units} managed ${input.channel === "email" ? "email" : "message"} unit${estimate.units === 1 ? "" : "s"}`,
      meterId,
      customerChargeCents,
      JSON.stringify({ providerKey: result.providerKey, approvalRequired: true })
    ]
  );
}

export async function sendMessage(input: MessagingSendInput): Promise<MessagingSendResult> {
  const providerKey = input.providerKey ?? fallbackProviderKey(input);
  const provider = getMessagingProvider(providerKey) ?? getProvidersForChannel(input.channel)[0];

  if (!provider) {
    return { ok: false, providerKey, status: 0, error: `No messaging provider is available for ${input.channel}.`, retryable: false };
  }

  if (!hasSendAuthorization(input)) {
    const result = {
      ok: false,
      providerKey: provider.providerKey,
      status: 0,
      error: "This message does not have an approved user action or automation policy.",
      retryable: false,
      metadata: { blockedBy: "approval_required" }
    } satisfies MessagingSendResult;
    await logEngineFailure(input, provider.providerKey, result);
    await logMessage(input, result);
    return result;
  }

  if (await isSuppressed(input)) {
    const result = {
      ok: false,
      providerKey: provider.providerKey,
      status: 0,
      error: "Recipient is opted out or suppressed.",
      retryable: false,
      metadata: { blockedBy: "recipient_suppressed" }
    } satisfies MessagingSendResult;
    await logEngineFailure(input, provider.providerKey, result);
    await logMessage(input, result);
    return result;
  }

  if (!(await hasRequiredConsent(input))) {
    const result = {
      ok: false,
      providerKey: provider.providerKey,
      status: 0,
      error: "Recipient consent is not granted.",
      retryable: false,
      metadata: { blockedBy: "consent_required" }
    } satisfies MessagingSendResult;
    await logEngineFailure(input, provider.providerKey, result);
    await logMessage(input, result);
    return result;
  }

  const sendDecision = await getMessagingSendDecision(input, provider.providerKey);
  if (!sendDecision.allowed) {
    const result = {
      ok: false,
      providerKey: provider.providerKey,
      status: 0,
      error: sendDecision.reason,
      retryable: false,
      metadata: { blockedBy: sendDecision.category }
    } satisfies MessagingSendResult;
    await logEngineFailure(input, provider.providerKey, result);
    await logMessage(input, result);
    return result;
  }

  const reservation = await reserveIdempotentSend(input, provider.providerKey);
  if (!reservation.acquired) {
    if (reservation.previous?.status === "failed" || reservation.previous?.status === "blocked") {
      return {
        ok: false,
        providerKey: reservation.previous.provider_key ?? provider.providerKey,
        status: 409,
        error: "This send key was already used by a failed attempt. Create a new explicit retry key to retry safely.",
        retryable: false,
        metadata: { duplicate: true, previousStatus: reservation.previous.status }
      };
    }
    return {
      ok: true,
      providerKey: reservation.previous?.provider_key ?? provider.providerKey,
      providerMessageId: reservation.previous?.provider_message_ref ?? null,
      status: reservation.previous?.status === "sent" || reservation.previous?.status === "delivered" ? "sent" : "queued",
      metadata: { duplicate: true, previousStatus: reservation.previous?.status ?? "unknown" }
    };
  }

  const result = input.attachments?.length ? await provider.sendMediaMessage(input) : await provider.sendMessage(input);
  await logMessage(input, result);
  if (!result.ok) await logEngineFailure(input, provider.providerKey, result);
  await logUsage(input, result);
  return result;
}

export function getMessagingProviderStatus(providerKey: string) {
  return getMessagingProvider(providerKey)?.getStatus() ?? { ready: false, missing: [providerKey], status: "not_configured" as const };
}
