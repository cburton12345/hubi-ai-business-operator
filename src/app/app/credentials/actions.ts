"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { encryptSecret, previewSecret } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { resolveTwilioSmsConfiguration } from "@/lib/messaging/twilio-tenant-config";
import { env } from "@/lib/env";
import { getVoiceAgentProvider } from "@/lib/providers/voice-adapters";

const saveCredentialSchema = z.object({
  providerKey: z.string().trim().min(2).max(120),
  credentialLabel: z.string().trim().min(2).max(160),
  credentialKind: z.enum(["api_key", "oauth_client_secret", "webhook_secret", "account_sid", "auth_token", "refresh_token", "other"]),
  secretValue: z.string().trim().min(4).max(10000),
  rotationDueAt: z.string().optional()
});

const archiveCredentialSchema = z.object({
  credentialId: z.string().uuid()
});

const activateProviderSchema = z.object({
  providerKey: z.string().trim().min(2).max(120),
  complianceAttestation: z.literal("true")
});

function isVoiceAgentProviderKey(providerKey: string) {
  return Boolean(getVoiceAgentProvider(providerKey));
}

function providerLaneForKey(providerKey: string) {
  const map: Record<string, { capabilityKey: string; laneKey: "customer_owned" | "ferocity_managed"; displayName: string }> = {
    email_provider: { capabilityKey: "email", laneKey: "customer_owned", displayName: "Customer email account" },
    resend_shared: { capabilityKey: "email", laneKey: "ferocity_managed", displayName: "Ferocity managed email" },
    twilio: { capabilityKey: "text_alerts", laneKey: "customer_owned", displayName: "Customer SMS account" },
    twilio_shared: { capabilityKey: "text_alerts", laneKey: "ferocity_managed", displayName: "Ferocity managed alerts" },
    stripe: { capabilityKey: "payments", laneKey: "customer_owned", displayName: "Customer Stripe" },
    stripe_connect: { capabilityKey: "payments", laneKey: "ferocity_managed", displayName: "Ferocity managed payments" },
    external_publishing: { capabilityKey: "website_publishing", laneKey: "customer_owned", displayName: "Customer website/CMS" },
    google_business_profile: { capabilityKey: "google_business_profile", laneKey: "customer_owned", displayName: "Customer Google Business Profile" },
    google_ads: { capabilityKey: "google_ads", laneKey: "customer_owned", displayName: "Customer Google Ads" },
    facebook: { capabilityKey: "meta_ads", laneKey: "customer_owned", displayName: "Customer Meta/Facebook" },
    tiktok: { capabilityKey: "tiktok_ads", laneKey: "customer_owned", displayName: "Customer TikTok" },
    reddit: { capabilityKey: "reddit_ads", laneKey: "customer_owned", displayName: "Customer Reddit" },
    microsoft_ads: { capabilityKey: "microsoft_ads", laneKey: "customer_owned", displayName: "Customer Microsoft Ads" },
    marketplacepro: { capabilityKey: "marketplacepro", laneKey: "customer_owned", displayName: "MarketplacePro account" }
  };

  const voiceProvider = getVoiceAgentProvider(providerKey);
  if (voiceProvider) {
    return {
      capabilityKey: "voice_ai",
      laneKey: "customer_owned" as const,
      displayName: `Customer ${voiceProvider.displayName} voice account`
    };
  }
  return map[providerKey] ?? null;
}

export async function saveTenantProviderCredentialAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = saveCredentialSchema.safeParse({
    providerKey: formData.get("providerKey"),
    credentialLabel: formData.get("credentialLabel"),
    credentialKind: formData.get("credentialKind"),
    secretValue: formData.get("secretValue"),
    rotationDueAt: formData.get("rotationDueAt")?.toString() || undefined
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const encrypted = encryptSecret(parsed.data.secretValue);
  const status = encrypted ? "configured" : "needs_encryption_key";
  const rotationDueAt = parsed.data.rotationDueAt ? new Date(parsed.data.rotationDueAt).toISOString() : null;

  await queryPostgres(
    `
    insert into public.tenant_provider_credentials (
      tenant_id, provider_key, credential_label, credential_kind, status, secret_preview, secret_fingerprint,
      encrypted_secret, encryption_iv, encryption_tag, rotation_due_at, created_by_user_id, updated_by_user_id, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12, $12, $13::jsonb)
    on conflict (tenant_id, provider_key, credential_label) do update
    set credential_kind = excluded.credential_kind,
        status = excluded.status,
        secret_preview = excluded.secret_preview,
        secret_fingerprint = excluded.secret_fingerprint,
        encrypted_secret = excluded.encrypted_secret,
        encryption_iv = excluded.encryption_iv,
        encryption_tag = excluded.encryption_tag,
        rotation_due_at = excluded.rotation_due_at,
        updated_by_user_id = excluded.updated_by_user_id,
        metadata_json = public.tenant_provider_credentials.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      workspaceId,
      parsed.data.providerKey,
      parsed.data.credentialLabel,
      parsed.data.credentialKind,
      status,
      encrypted?.secretPreview ?? previewSecret(parsed.data.secretValue),
      encrypted?.secretFingerprint ?? null,
      encrypted?.encryptedSecret ?? null,
      encrypted?.encryptionIv ?? null,
      encrypted?.encryptionTag ?? null,
      rotationDueAt,
      session?.userId ?? null,
      JSON.stringify({ savedFrom: "credentials_page", secretStored: Boolean(encrypted), liveActionsStillDisabled: true })
    ]
  );

  if (encrypted) {
    await queryPostgres(
      `
      insert into public.provider_accounts (tenant_id, provider_key, display_name, status, credentials_status, live_actions_enabled, metadata_json)
      values ($1, $2, $3, 'paused', 'configured', false, $4::jsonb)
      on conflict (tenant_id, provider_key) do update
      set credentials_status = 'configured',
          status = case when public.provider_accounts.status = 'planned' then 'paused' else public.provider_accounts.status end,
          live_actions_enabled = false,
          metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        workspaceId,
        parsed.data.providerKey,
        parsed.data.providerKey.replaceAll("_", " "),
        JSON.stringify({ tenantCredentialStored: true, credentialLabel: parsed.data.credentialLabel })
      ]
    );

    const lane = providerLaneForKey(parsed.data.providerKey);
    let shouldUpdateLane = true;
    if (isVoiceAgentProviderKey(parsed.data.providerKey)) {
      const selectedVoiceRoute = await queryPostgres<{ selected: boolean }>(
        `
        select exists (
          select 1 from public.voice_provider_routes
          where tenant_id = $1 and route_family = 'voice_orchestrator' and primary_provider_key = $2
        ) as selected
        `,
        [workspaceId, parsed.data.providerKey]
      );
      shouldUpdateLane = selectedVoiceRoute?.rows[0]?.selected === true;
    }
    if (lane && shouldUpdateLane) {
      await queryPostgres(
        `
        insert into public.provider_connection_lanes (
          tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
          credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
        )
        values ($1, $2, $3, $4, $5, 'paused', 'configured', false, 'provider_account', $6, $7::jsonb)
        on conflict (tenant_id, capability_key, lane_key) do update
        set provider_key = excluded.provider_key,
            display_name = excluded.display_name,
            connection_status = 'paused',
            credentials_status = 'configured',
            live_actions_enabled = false,
            source = 'provider_account',
            plain_language_status = excluded.plain_language_status,
            metadata_json = public.provider_connection_lanes.metadata_json || excluded.metadata_json,
            updated_at = now()
        `,
        [
          workspaceId,
          lane.capabilityKey,
          parsed.data.providerKey,
          lane.laneKey,
          lane.displayName,
          `${lane.displayName} has credentials saved. Live actions stay paused until approval controls are reviewed.`,
          JSON.stringify({ credentialLabel: parsed.data.credentialLabel, updatedFrom: "credentials_page" })
        ]
      );
    }

    if (parsed.data.providerKey === "twilio") {
      await queryPostgres(
        `
        insert into public.tenant_messaging_accounts (
          tenant_id, provider_key, ownership_mode, account_label, connection_status,
          credentials_status, live_sending_enabled, inbound_enabled, outbound_enabled,
          default_channel, metadata_json
        )
        values ($1, 'twilio_sms', 'customer_owned', 'Customer Twilio', 'configured',
          'configured', false, false, false, 'sms', $2::jsonb)
        on conflict (tenant_id, provider_key, ownership_mode) do update
        set connection_status = 'configured',
            credentials_status = 'configured',
            live_sending_enabled = false,
            outbound_enabled = false,
            metadata_json = public.tenant_messaging_accounts.metadata_json || excluded.metadata_json,
            updated_at = now()
        `,
        [workspaceId, JSON.stringify({ credentialsStoredInVault: true, activationRequired: true })]
      );
    }

    if (isVoiceAgentProviderKey(parsed.data.providerKey)) {
      await queryPostgres(
        `
        update public.voice_provider_routes
        set status = 'configured',
            live_actions_enabled = false,
            plain_language_status = 'Customer voice-provider credentials are encrypted. Verify and activate after webhook authentication, consent, budget, and test-call review.',
            updated_at = now()
        where tenant_id = $1 and route_family = 'voice_orchestrator' and primary_provider_key = $2
        `,
        [workspaceId, parsed.data.providerKey]
      );
    }

    await queryPostgres(
      `
      update public.integration_connections
      set credentials_status = 'configured',
          status = case when status = 'not_connected' then 'planned' else status end,
          updated_at = now(),
          metadata_json = metadata_json || $3::jsonb
      where tenant_id = $1 and provider = $2
      `,
      [workspaceId, parsed.data.providerKey, JSON.stringify({ tenantCredentialStored: true })]
    );
  }

  revalidatePath("/app/credentials");
  revalidatePath("/app/integrations");
  revalidatePath("/app/system-health");
}

async function verifyTwilio(tenantId: string) {
  const configuration = await resolveTwilioSmsConfiguration(tenantId, false);
  if (!configuration?.fromNumber) {
    return {
      ok: false,
      reason: "Required Twilio credentials or the inbound/outbound from_number are missing.",
      sender: null,
      providerResourceId: null
    };
  }
  const authorization = Buffer.from(`${configuration.accountSid}:${configuration.webhookAuthToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(configuration.accountSid)}.json`,
    { headers: { Authorization: `Basic ${authorization}` }, cache: "no-store" }
  );
  return {
    ok: response.ok,
    reason: response.ok ? "" : `Twilio verification returned HTTP ${response.status}.`,
    sender: configuration.fromNumber,
    providerResourceId: null
  };
}

async function verifyVoiceProvider(tenantId: string, providerKey: string) {
  const adapter = getVoiceAgentProvider(providerKey);
  if (!adapter || adapter.adapterStatus !== "live") {
    return {
      ok: false,
      reason: `${adapter?.displayName ?? providerKey} does not have a live Ferocity adapter yet.`,
      sender: null,
      providerResourceId: null
    };
  }
  const accountResult = await queryPostgres<{ assistant_id: string | null }>(
    `
    select nullif(metadata_json->>'assistantId', '') as assistant_id
    from public.provider_accounts
    where tenant_id = $1 and provider_key = $2
    limit 1
    `,
    [tenantId, providerKey]
  );
  const assistantId = accountResult?.rows[0]?.assistant_id;
  if (!assistantId) {
    return {
      ok: false,
      reason: `Create or update the ${adapter.displayName} assistant from Receptionist Setup before activation.`,
      sender: null,
      providerResourceId: null
    };
  }
  const appUrl = (env.FEROCITY_APP_URL ?? "https://ferocity.live").replace(/\/+$/, "");
  const verified = await adapter.verifyConnection(
    {
      tenantId,
      correlationId: `voice-verify:${providerKey}:${tenantId}`,
      idempotencyKey: `voice-verify:${providerKey}:${tenantId}`,
      liveActionsEnabled: false
    },
    {
      assistantId,
      webhookUrl: `${appUrl}/api/integrations/voice-ai/webhook`
    }
  );
  if (!verified.ok) {
    return {
      ok: false,
      reason: verified.safeMessage,
      sender: null,
      providerResourceId: null
    };
  }
  return {
    ok: true,
    reason: "",
    sender: verified.data.phoneNumber,
    providerResourceId: verified.data.providerResourceId
  };
}

export async function verifyAndActivateByoProviderAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = activateProviderSchema.safeParse({
    providerKey: formData.get("providerKey"),
    complianceAttestation: formData.get("complianceAttestation")
  });
  if (!parsed.success) return;
  if (parsed.data.providerKey !== "twilio" && !isVoiceAgentProviderKey(parsed.data.providerKey)) return;
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  if (isVoiceAgentProviderKey(parsed.data.providerKey)) {
    const selectedRoute = await queryPostgres<{ primary_provider_key: string }>(
      `
      select primary_provider_key
      from public.voice_provider_routes
      where tenant_id = $1 and route_family = 'voice_orchestrator'
      limit 1
      `,
      [workspaceId]
    );
    if (selectedRoute?.rows[0]?.primary_provider_key !== parsed.data.providerKey) return;
  }
  const verification =
    parsed.data.providerKey === "twilio"
      ? await verifyTwilio(workspaceId)
      : await verifyVoiceProvider(workspaceId, parsed.data.providerKey);

  if (!verification.ok) {
    await queryPostgres(
      `
      update public.provider_accounts
      set status = 'error', live_actions_enabled = false,
          metadata_json = metadata_json || $3::jsonb, updated_at = now()
      where tenant_id = $1 and provider_key = $2
      `,
      [workspaceId, parsed.data.providerKey, JSON.stringify({ verificationError: verification.reason, verifiedAt: new Date().toISOString() })]
    );
    revalidatePath("/app/credentials");
    return;
  }

  await queryPostgres(
    `
    update public.provider_accounts
    set status = 'connected', credentials_status = 'configured', live_actions_enabled = true,
        approved_by_user_id = $3, approved_at = now(),
        metadata_json = metadata_json || $4::jsonb, updated_at = now()
    where tenant_id = $1 and provider_key = $2
    `,
    [
      workspaceId,
      parsed.data.providerKey,
      session?.userId ?? null,
      JSON.stringify({ verifiedAt: new Date().toISOString(), complianceAttested: true, activationSource: "credential_vault" })
    ]
  );

  const lane = providerLaneForKey(parsed.data.providerKey);
  if (lane) {
    await queryPostgres(
      `
      update public.provider_connection_lanes
      set provider_key = $3, connection_status = 'connected', credentials_status = 'configured',
          live_actions_enabled = true,
          plain_language_status = display_name || ' is verified and live. Consent, suppression, budgets, and workspace controls still apply.',
          updated_at = now()
      where tenant_id = $1 and capability_key = $2 and lane_key = 'customer_owned'
      `,
      [workspaceId, lane.capabilityKey, parsed.data.providerKey]
    );
  }

  if (parsed.data.providerKey === "twilio") {
    await queryPostgres(
      `
      update public.tenant_messaging_accounts
      set connection_status = 'active', credentials_status = 'configured',
          live_sending_enabled = true, inbound_enabled = true, outbound_enabled = true,
          metadata_json = metadata_json || $2::jsonb, updated_at = now()
      where tenant_id = $1 and provider_key = 'twilio_sms' and ownership_mode = 'customer_owned'
      `,
      [workspaceId, JSON.stringify({ verifiedAt: new Date().toISOString(), complianceAttested: true })]
    );
    if (verification.sender) {
      await queryPostgres(
        `
        insert into public.tenant_phone_numbers (
          tenant_id, messaging_account_id, provider_key, phone_number, number_mode,
          status, inbound_enabled, outbound_enabled, voice_enabled, sms_enabled, mms_enabled, metadata_json
        )
        values (
          $1,
          (select id from public.tenant_messaging_accounts
           where tenant_id = $1 and provider_key = 'twilio_sms' and ownership_mode = 'customer_owned' limit 1),
          'twilio_sms', $2, 'customer_owned', 'active', true, true, false, true, true, $3::jsonb
        )
        on conflict (tenant_id, phone_number) do update
        set messaging_account_id = excluded.messaging_account_id, provider_key = excluded.provider_key,
            status = 'active', inbound_enabled = true, outbound_enabled = true,
            sms_enabled = true, mms_enabled = true,
            metadata_json = public.tenant_phone_numbers.metadata_json || excluded.metadata_json,
            updated_at = now()
        `,
        [
          workspaceId,
          verification.sender,
          JSON.stringify({
            inboundWebhook: "/api/messaging/webhooks/twilio",
            deliveryWebhook: "/api/messaging/webhooks/twilio"
          })
        ]
      );
    }
  } else {
    await queryPostgres(
      `
      update public.voice_provider_routes
      set status = 'active', live_actions_enabled = true,
          plain_language_status = 'The selected customer voice provider is verified and active. Consent, call budgets, test-call rules, and human fallback remain enforced.',
          updated_at = now()
      where tenant_id = $1 and route_family = 'voice_orchestrator' and primary_provider_key = $2
      `,
      [workspaceId, parsed.data.providerKey]
    );
    if (verification.sender && verification.providerResourceId) {
      await queryPostgres(
        `
        insert into public.telephony_numbers (
          tenant_id, provider_key, number_mode, phone_number, display_name, provider_resource_id,
          status, inbound_enabled, outbound_enabled, recording_default_enabled,
          transcript_default_enabled, compliance_status, metadata_json
        )
        values (
          $1, $4, 'customer_owned', $2, 'Customer voice-provider number', $3,
          'active', true, true, false, true, 'ready', $5::jsonb
        )
        on conflict (tenant_id, phone_number) do update
        set provider_key = excluded.provider_key, provider_resource_id = excluded.provider_resource_id,
            status = 'active', inbound_enabled = true, outbound_enabled = true,
            compliance_status = 'ready',
            metadata_json = public.telephony_numbers.metadata_json || excluded.metadata_json,
            updated_at = now()
        `,
        [
          workspaceId,
          verification.sender,
          verification.providerResourceId,
          parsed.data.providerKey,
          JSON.stringify({ webhook: "/api/integrations/voice-ai/webhook", complianceAttested: true })
        ]
      );
    }
    await queryPostgres(
      `
      update public.receptionist_setup_checklists
      set phone_number_status = 'complete', activation_status = 'complete',
          status = 'active', updated_at = now()
      where tenant_id = $1
      `,
      [workspaceId]
    );
  }

  revalidatePath("/app/credentials");
  revalidatePath("/app/integrations");
  revalidatePath("/app/messaging");
  revalidatePath("/app/receptionist-setup");
}

export async function archiveTenantProviderCredentialAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const parsed = archiveCredentialSchema.safeParse({
    credentialId: formData.get("credentialId")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const archived = await queryPostgres<{ provider_key: string }>(
    `
    update public.tenant_provider_credentials
    set status = 'archived',
        encrypted_secret = null,
        encryption_iv = null,
        encryption_tag = null,
        updated_by_user_id = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning provider_key
    `,
    [workspaceId, parsed.data.credentialId, session?.userId ?? null, JSON.stringify({ archivedFrom: "credentials_page" })]
  );
  const providerKey = archived?.rows[0]?.provider_key;
  if (!providerKey) return;

  await queryPostgres(
    `
    update public.provider_accounts
    set status = 'paused', live_actions_enabled = false,
        metadata_json = metadata_json || $3::jsonb, updated_at = now()
    where tenant_id = $1 and provider_key = $2
    `,
    [
      workspaceId,
      providerKey,
      JSON.stringify({ disabledReason: "credential_archived", disabledAt: new Date().toISOString() })
    ]
  );

  const lane = providerLaneForKey(providerKey);
  if (lane) {
    await queryPostgres(
      `
      update public.provider_connection_lanes
      set connection_status = 'paused', live_actions_enabled = false,
          plain_language_status = display_name || ' is paused because a credential was archived.',
          updated_at = now()
      where tenant_id = $1 and capability_key = $2 and lane_key = $3 and provider_key = $4
      `,
      [workspaceId, lane.capabilityKey, lane.laneKey, providerKey]
    );
  }

  if (providerKey === "twilio") {
    await Promise.all([
      queryPostgres(
        `
        update public.tenant_messaging_accounts
        set connection_status = 'configured', live_sending_enabled = false,
            inbound_enabled = false, outbound_enabled = false, updated_at = now()
        where tenant_id = $1 and provider_key = 'twilio_sms' and ownership_mode = 'customer_owned'
        `,
        [workspaceId]
      ),
      queryPostgres(
        `
        update public.tenant_phone_numbers
        set status = 'paused', inbound_enabled = false, outbound_enabled = false, updated_at = now()
        where tenant_id = $1 and provider_key in ('twilio', 'twilio_sms') and number_mode = 'customer_owned'
        `,
        [workspaceId]
      )
    ]);
  }

  if (isVoiceAgentProviderKey(providerKey)) {
    await Promise.all([
      queryPostgres(
        `
        update public.voice_provider_routes
        set status = 'configured', live_actions_enabled = false,
            plain_language_status = 'The voice provider is paused because a credential was archived.',
            updated_at = now()
        where tenant_id = $1 and route_family = 'voice_orchestrator' and primary_provider_key = $2
        `,
        [workspaceId, providerKey]
      ),
      queryPostgres(
        `
        update public.telephony_numbers
        set status = 'paused', inbound_enabled = false, outbound_enabled = false, updated_at = now()
        where tenant_id = $1 and provider_key = $2
        `,
        [workspaceId, providerKey]
      )
    ]);
  }

  revalidatePath("/app/credentials");
  revalidatePath("/app/integrations");
  revalidatePath("/app/system-health");
  revalidatePath("/app/messaging");
  revalidatePath("/app/receptionist-setup");
}
