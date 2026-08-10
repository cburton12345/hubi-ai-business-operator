import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/credentials/credential-vault";
import { queryPostgres } from "@/lib/db/postgres";
import { sendMessage } from "@/lib/messaging/messaging-engine";
import { getVoiceAgentProvider } from "@/lib/providers/voice-adapters";

type OwnerPreferenceInput = {
  tenantId: string;
  userId: string;
  phoneNumber: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  maximumProactiveCallsPerDay?: number;
  timezone?: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  voicemailAllowed?: boolean;
  retryAllowed?: boolean;
  textSummaryAfterCall?: boolean;
};

type OwnerPreferenceSettingsInput = Omit<OwnerPreferenceInput, "phoneNumber">;

type EncryptedDestination = {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  throw new Error("Enter a valid owner phone number.");
}

function verificationKey() {
  const value = process.env.SECURITY_HMAC_KEY?.trim() || process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!value || value.length < 32) {
    throw new Error("Owner verification is unavailable until Ferocity's security key is configured.");
  }
  return value;
}

export function hashOwnerVerificationCode(challengeId: string, code: string) {
  return crypto.createHmac("sha256", verificationKey()).update(`${challengeId}:${code}`).digest("hex");
}

export function ownerVerificationCodesMatch(expectedHash: string, candidateHash: string) {
  const expected = Buffer.from(expectedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export async function saveOwnerConversationPreference(input: OwnerPreferenceInput) {
  const phoneNumber = normalizePhone(input.phoneNumber);
  const encrypted = encryptSecret(phoneNumber);
  if (!encrypted || !encrypted.secretFingerprint) {
    throw new Error("Ferocity cannot encrypt the owner destination until the credential vault is configured.");
  }
  const allowed = await queryPostgres<{ user_id: string }>(
    `select user_id from public.tenant_users
     where tenant_id=$1 and user_id=$2 and status='active' and role in ('owner','admin','operator') limit 1`,
    [input.tenantId, input.userId]
  );
  if (!allowed?.rows[0]) throw new Error("Only an active owner, admin, or operator can receive private business briefings.");

  const encryptedJson = JSON.stringify({
    encryptedSecret: encrypted.encryptedSecret,
    encryptionIv: encrypted.encryptionIv,
    encryptionTag: encrypted.encryptionTag
  } satisfies EncryptedDestination);
  await queryPostgres(
    `insert into public.owner_conversation_preferences (
       tenant_id,user_id,status,voice_enabled,sms_enabled,destination_ciphertext,
       destination_fingerprint,maximum_proactive_calls_per_day,timezone,
       quiet_hours_start,quiet_hours_end,voicemail_allowed,retry_allowed,
       text_summary_after_call,metadata_json
     ) values ($1,$2,'pending_verification',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     on conflict (tenant_id,user_id) do update set
       status=case when public.owner_conversation_preferences.destination_fingerprint=excluded.destination_fingerprint
         and public.owner_conversation_preferences.destination_verified_at is not null
         then public.owner_conversation_preferences.status else 'pending_verification' end,
       voice_enabled=excluded.voice_enabled,sms_enabled=excluded.sms_enabled,
       destination_ciphertext=excluded.destination_ciphertext,
       destination_fingerprint=excluded.destination_fingerprint,
       destination_verified_at=case when public.owner_conversation_preferences.destination_fingerprint=excluded.destination_fingerprint
         then public.owner_conversation_preferences.destination_verified_at else null end,
       maximum_proactive_calls_per_day=excluded.maximum_proactive_calls_per_day,
       timezone=excluded.timezone,quiet_hours_start=excluded.quiet_hours_start,
       quiet_hours_end=excluded.quiet_hours_end,voicemail_allowed=excluded.voicemail_allowed,
       retry_allowed=excluded.retry_allowed,text_summary_after_call=excluded.text_summary_after_call,
       metadata_json=public.owner_conversation_preferences.metadata_json || excluded.metadata_json,
       updated_at=now()`,
    [
      input.tenantId, input.userId, input.voiceEnabled, input.smsEnabled, encryptedJson,
      encrypted.secretFingerprint, Math.max(0, Math.min(20, input.maximumProactiveCallsPerDay ?? 2)),
      input.timezone ?? "America/Los_Angeles", input.quietHoursStart ?? null,
      input.quietHoursEnd ?? null, input.voicemailAllowed ?? false,
      input.retryAllowed ?? true, input.textSummaryAfterCall ?? true,
      JSON.stringify({ source: "owner_briefing_setup", destinationPreview: encrypted.secretPreview })
    ]
  );
}

export async function updateOwnerConversationSettings(input: OwnerPreferenceSettingsInput) {
  const updated = await queryPostgres<{ id: string }>(
    `update public.owner_conversation_preferences p
     set voice_enabled=$3,sms_enabled=$4,maximum_proactive_calls_per_day=$5,
         timezone=$6,quiet_hours_start=$7,quiet_hours_end=$8,voicemail_allowed=$9,
         retry_allowed=$10,text_summary_after_call=$11,updated_at=now()
     where p.tenant_id=$1 and p.user_id=$2
       and exists (
         select 1 from public.tenant_users tu
         where tu.tenant_id=p.tenant_id and tu.user_id=p.user_id and tu.status='active'
           and tu.role in ('owner','admin','operator')
       )
     returning id`,
    [
      input.tenantId, input.userId, input.voiceEnabled, input.smsEnabled,
      Math.max(0, Math.min(20, input.maximumProactiveCallsPerDay ?? 2)),
      input.timezone ?? "America/Los_Angeles", input.quietHoursStart ?? null,
      input.quietHoursEnd ?? null, input.voicemailAllowed ?? false,
      input.retryAllowed ?? true, input.textSummaryAfterCall ?? true
    ]
  );
  if (!updated?.rows[0]) throw new Error("Save and verify a phone number before changing owner briefing settings.");
}

type PendingOwnerDestination = {
  destination_ciphertext: string;
  destination_fingerprint: string;
};

export async function requestOwnerDestinationVerification(input: { tenantId: string; userId: string }) {
  const preference = await queryPostgres<PendingOwnerDestination>(
    `select destination_ciphertext,destination_fingerprint
     from public.owner_conversation_preferences
     where tenant_id=$1 and user_id=$2 and status='pending_verification'
       and destination_ciphertext is not null and destination_fingerprint is not null
     limit 1`,
    [input.tenantId, input.userId]
  );
  const pending = preference?.rows[0];
  if (!pending) {
    return { ok: false as const, message: "Save a phone number before requesting a verification code." };
  }

  const recent = await queryPostgres<{ sends: string }>(
    `select count(*)::text as sends
     from public.owner_destination_verification_challenges
     where tenant_id=$1 and user_id=$2 and created_at>now()-interval '1 hour'`,
    [input.tenantId, input.userId]
  );
  if (Number(recent?.rows[0]?.sends ?? 0) >= 3) {
    return { ok: false as const, message: "Too many codes were requested. Wait an hour before trying again." };
  }

  const toNumber = destinationFromCiphertext(pending.destination_ciphertext);
  if (!toNumber) {
    return { ok: false as const, message: "Ferocity could not read the saved phone number. Save it again and retry." };
  }

  await queryPostgres(
    `update public.owner_destination_verification_challenges
     set status=case when expires_at<=now() then 'expired' else 'canceled' end,updated_at=now()
     where tenant_id=$1 and user_id=$2 and status='pending'`,
    [input.tenantId, input.userId]
  );

  const challengeId = crypto.randomUUID();
  const code = crypto.randomInt(100_000, 1_000_000).toString();
  const codeHash = hashOwnerVerificationCode(challengeId, code);
  await queryPostgres(
    `insert into public.owner_destination_verification_challenges (
       id,tenant_id,user_id,destination_fingerprint,code_hash,status,attempts_remaining,
       expires_at,metadata_json
     ) values ($1,$2,$3,$4,$5,'pending',5,now()+interval '10 minutes',$6::jsonb)`,
    [challengeId, input.tenantId, input.userId, pending.destination_fingerprint, codeHash,
      JSON.stringify({ source: "owner_briefing_setup", requestedByAuthenticatedUser: true })]
  );

  const delivery = await sendMessage({
    tenantId: input.tenantId,
    channel: "sms",
    to: toNumber,
    body: `${code} is your Ferocity verification code. It expires in 10 minutes. Never share this code.`,
    idempotencyKey: `owner-destination-verification:${challengeId}`,
    authorization: {
      source: "authenticated_owner_verification",
      humanApproved: true,
      consentBasis: "authenticated_owner_verification"
    },
    metadata: {
      aiGenerated: false,
      source: "owner_destination_verification",
      securityTransactional: true,
      challengeId
    }
  });
  if (!delivery.ok || delivery.status === "manual_ready") {
    const reason = delivery.ok ? "A live text provider is not connected." : delivery.error;
    await queryPostgres(
      `update public.owner_destination_verification_challenges
       set status='delivery_failed',provider_key=$3,metadata_json=metadata_json || $4::jsonb,updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, challengeId, delivery.providerKey, JSON.stringify({ safeDeliveryError: reason })]
    );
    return { ok: false as const, message: `The code could not be sent. ${reason}` };
  }

  await queryPostgres(
    `update public.owner_destination_verification_challenges
     set provider_key=$3,provider_message_id=$4,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, challengeId, delivery.providerKey, delivery.providerMessageId]
  );
  return { ok: true as const, message: "Verification code sent. It expires in 10 minutes." };
}

type VerificationChallengeRow = {
  id: string;
  code_hash: string;
  attempts_remaining: number;
  destination_fingerprint: string;
};

export async function verifyOwnerDestination(input: { tenantId: string; userId: string; code: string }) {
  const challenge = await queryPostgres<VerificationChallengeRow>(
    `select id,code_hash,attempts_remaining,destination_fingerprint
     from public.owner_destination_verification_challenges
     where tenant_id=$1 and user_id=$2 and status='pending' and expires_at>now()
     order by created_at desc limit 1`,
    [input.tenantId, input.userId]
  );
  const pending = challenge?.rows[0];
  if (!pending) {
    await queryPostgres(
      `update public.owner_destination_verification_challenges
       set status='expired',updated_at=now()
       where tenant_id=$1 and user_id=$2 and status='pending' and expires_at<=now()`,
      [input.tenantId, input.userId]
    );
    return { ok: false as const, message: "That code expired or is no longer active. Request a new one." };
  }

  const candidateHash = hashOwnerVerificationCode(pending.id, input.code);
  if (!ownerVerificationCodesMatch(pending.code_hash, candidateHash)) {
    const locked = pending.attempts_remaining <= 1;
    await queryPostgres(
      `update public.owner_destination_verification_challenges
       set attempts_remaining=greatest(0,attempts_remaining-1),
           status=case when attempts_remaining<=1 then 'locked' else status end,
           last_attempt_at=now(),updated_at=now()
       where tenant_id=$1 and id=$2 and status='pending'`,
      [input.tenantId, pending.id]
    );
    return {
      ok: false as const,
      message: locked
        ? "Too many incorrect attempts. Request a new code."
        : `That code is incorrect. ${pending.attempts_remaining - 1} attempts remain.`
    };
  }

  const claimed = await queryPostgres<{ id: string }>(
    `update public.owner_destination_verification_challenges
     set status='verified',verified_at=now(),last_attempt_at=now(),updated_at=now()
     where tenant_id=$1 and id=$2 and status='pending' and expires_at>now()
     returning id`,
    [input.tenantId, pending.id]
  );
  if (!claimed?.rows[0]) {
    return { ok: false as const, message: "That code was already used or expired. Request a new one." };
  }

  const activated = await queryPostgres<{ id: string }>(
    `update public.owner_conversation_preferences
     set status='active',destination_verified_at=now(),updated_at=now()
     where tenant_id=$1 and user_id=$2 and status='pending_verification'
       and destination_fingerprint=$3
     returning id`,
    [input.tenantId, input.userId, pending.destination_fingerprint]
  );
  if (!activated?.rows[0]) {
    await queryPostgres(
      `update public.owner_destination_verification_challenges
       set status='canceled',updated_at=now() where tenant_id=$1 and id=$2`,
      [input.tenantId, pending.id]
    );
    return { ok: false as const, message: "The saved phone number changed. Request a new verification code." };
  }

  await queryPostgres(
    `insert into public.owner_conversation_auth_sessions (
       tenant_id,user_id,channel_key,authentication_method,trust_level,status,verified_at,expires_at,metadata_json
     ) values ($1,$2,'sms','one_time_code','strong','verified',now(),now()+interval '24 hours',$3::jsonb)`,
    [input.tenantId, input.userId, JSON.stringify({ source: "owner_destination_verification", challengeId: pending.id })]
  );
  return { ok: true as const, message: "Phone verified. Private owner briefings are now active." };
}

type BriefingPreferenceRow = {
  destination_ciphertext: string;
  maximum_proactive_calls_per_day: number;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

function destinationFromCiphertext(value: string) {
  try {
    const parsed = JSON.parse(value) as EncryptedDestination;
    return decryptSecret(parsed);
  } catch {
    return null;
  }
}

function localMinutes(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  return (Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function configuredMinutes(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

async function buildOwnerBriefingVariables(input: {
  tenantId: string;
  userId: string;
  briefingType: string;
}) {
  const [userResult, actionsResult] = await Promise.all([
    queryPostgres<{ name: string | null }>(
      `select name from public.users where id=$1 limit 1`,
      [input.userId]
    ),
    queryPostgres<{
      id: string;
      title: string;
      summary: string | null;
      recommended_action: string | null;
      status: string;
      priority: string;
      target_table: string | null;
      target_id: string | null;
    }>(
      `select id,title,summary,recommended_action,status,priority,target_table,target_id::text
       from public.office_manager_action_requests
       where tenant_id=$1 and status in ('draft','needs_review','blocked','queued')
       order by case priority when 'urgent' then 0 when 'high' then 1 else 2 end,created_at desc
       limit 8`,
      [input.tenantId]
    )
  ]);
  const items = (actionsResult?.rows ?? []).map((row) => ({
    actionRequestId: row.id,
    title: row.title,
    summary: row.summary,
    recommendedAction: row.recommended_action,
    status: row.status,
    priority: row.priority,
    targetType: row.target_table,
    targetId: row.target_id
  }));
  return {
    owner_name: userResult?.rows[0]?.name?.trim() || "the owner",
    briefing_type: input.briefingType,
    briefing_context: JSON.stringify({
      generatedAt: new Date().toISOString(),
      instruction: "Discuss only these verified Ferocity records. Ask before external or high-impact action and use the owner action tool with the listed IDs.",
      items
    }).slice(0, 12_000)
  };
}

export function isWithinQuietHours(input: {
  timeZone: string;
  start: string | null;
  end: string | null;
  now?: Date;
}) {
  const start = configuredMinutes(input.start);
  const end = configuredMinutes(input.end);
  if (start === null || end === null || start === end) return false;
  const current = localMinutes(input.timeZone, input.now);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export async function startOwnerBriefingCall(input: {
  tenantId: string;
  brandId?: string | null;
  userId: string;
  briefingType: string;
  forceUrgent?: boolean;
}) {
  const preference = await queryPostgres<BriefingPreferenceRow>(
    `select destination_ciphertext,maximum_proactive_calls_per_day,timezone,
       quiet_hours_start::text,quiet_hours_end::text
     from public.owner_conversation_preferences
     where tenant_id=$1 and user_id=$2 and status='active' and voice_enabled=true
       and destination_verified_at is not null limit 1`,
    [input.tenantId, input.userId]
  );
  const configured = preference?.rows[0];
  if (!configured) return { ok: false as const, message: "Owner voice briefings are not active for this user." };
  if (!input.forceUrgent && isWithinQuietHours({
    timeZone: configured.timezone,
    start: configured.quiet_hours_start,
    end: configured.quiet_hours_end
  })) {
    return { ok: false as const, message: "The briefing can wait until the owner's quiet hours end." };
  }

  const attention = await queryPostgres<{ state_key: string }>(
    `select state_key from public.owner_attention_states
     where tenant_id=$1 and user_id=$2 and status='active' and starts_at<=now()
       and (expires_at is null or expires_at>now()) order by starts_at desc limit 1`,
    [input.tenantId, input.userId]
  );
  if (!input.forceUrgent && ["driving","meeting","focus","vacation","emergency_only"].includes(attention?.rows[0]?.state_key ?? "")) {
    return { ok: false as const, message: "Ferocity held the briefing because the owner is unavailable." };
  }

  const callsToday = await queryPostgres<{ count: string }>(
    `select count(*)::text as count from public.owner_conversation_auth_sessions
     where tenant_id=$1 and user_id=$2 and channel_key='phone'
       and created_at>=date_trunc('day',now() at time zone $3) at time zone $3`,
    [input.tenantId, input.userId, configured.timezone]
  );
  if (!input.forceUrgent && Number(callsToday?.rows[0]?.count ?? 0) >= configured.maximum_proactive_calls_per_day) {
    return { ok: false as const, message: "The owner's daily proactive-call limit has been reached." };
  }

  const duplicate = await queryPostgres<{ id: string }>(
    `select id from public.office_manager_conversation_sessions
     where tenant_id=$1 and channel_key='owner_command' and intent_key=$2
       and started_at>now()-interval '30 minutes' and status in ('open','waiting_on_owner','ai_handled','closed')
     limit 1`,
    [input.tenantId, `owner_briefing:${input.briefingType}`]
  );
  if (duplicate?.rows[0]) return { ok: false as const, message: "Ferocity already started this briefing recently." };

  const profile = await queryPostgres<{ id: string; metadata_json: Record<string, unknown> }>(
    `select id,metadata_json from public.office_manager_profiles
     where tenant_id=$1 and status in ('ready','active')
       and ($2::uuid is null or brand_id=$2 or brand_id is null)
     order by case when brand_id=$2 then 0 else 1 end,updated_at desc limit 1`,
    [input.tenantId, input.brandId ?? null]
  );
  const profileRow = profile?.rows[0];
  const assistantId = typeof profileRow?.metadata_json?.ownerVoiceAssistantId === "string"
    ? profileRow.metadata_json.ownerVoiceAssistantId
    : null;
  if (!profileRow || !assistantId) {
    return { ok: false as const, message: "The private owner voice agent has not been provisioned yet." };
  }

  const channel = await queryPostgres<{ provider_key: string; live_actions_enabled: boolean }>(
    `select provider_key,live_actions_enabled from public.office_manager_channel_configs
     where tenant_id=$1 and profile_id=$2 and channel_key='owner_command'
       and status in ('ready','active') and outbound_enabled=true limit 1`,
    [input.tenantId, profileRow.id]
  );
  const channelRow = channel?.rows[0];
  const providerKey = channelRow?.provider_key === "ferocity_ai_workforce"
    ? "retell_voice"
    : channelRow?.provider_key;
  const provider = providerKey ? getVoiceAgentProvider(providerKey) : null;
  if (!provider || provider.adapterStatus !== "live" || !channelRow?.live_actions_enabled) {
    return { ok: false as const, message: "The owner voice route is not enabled for live outbound calls." };
  }

  const toNumber = destinationFromCiphertext(configured.destination_ciphertext);
  if (!toNumber) return { ok: false as const, message: "The verified owner destination could not be decrypted." };
  const correlationId = crypto.randomUUID();
  const context = {
    tenantId: input.tenantId,
    brandId: input.brandId ?? null,
    correlationId,
    idempotencyKey: `owner-briefing:${input.tenantId}:${input.userId}:${correlationId}`,
    liveActionsEnabled: true,
    purpose: "production" as const
  };
  const connection = await provider.getConnection(context, true);
  if (!connection.ok) return { ok: false as const, message: connection.safeMessage };

  const conversation = await queryPostgres<{ id: string }>(
    `insert into public.office_manager_conversation_sessions (
       tenant_id,brand_id,profile_id,channel_key,provider_key,status,intent_key,summary,metadata_json
     ) values ($1,$2,$3,'owner_command',$4,'open',$5,$6,$7::jsonb) returning id`,
    [input.tenantId, input.brandId ?? null, profileRow.id, provider.providerKey,
      `owner_briefing:${input.briefingType}`, "Private owner briefing started.",
      JSON.stringify({ source: "owner_briefing", userId: input.userId, correlationId })]
  );
  const conversationId = conversation?.rows[0]?.id;
  if (!conversationId) return { ok: false as const, message: "Ferocity could not create the private briefing session." };

  const call = await provider.startOutboundCall(context, {
    toNumber,
    fromNumber: connection.data.phoneNumber,
    assistantId,
    dynamicVariables: await buildOwnerBriefingVariables({
      tenantId: input.tenantId,
      userId: input.userId,
      briefingType: input.briefingType
    })
  });
  if (!call.ok) {
    await queryPostgres(
      `update public.office_manager_conversation_sessions set status='failed',summary=$3,ended_at=now(),updated_at=now()
       where tenant_id=$1 and id=$2`,
      [input.tenantId, conversationId, call.safeMessage]
    );
    return { ok: false as const, message: call.safeMessage };
  }

  const recentStrongAuth = await queryPostgres<{ id: string }>(
    `select id from public.owner_conversation_auth_sessions
     where tenant_id=$1 and user_id=$2 and status='verified' and trust_level='strong'
       and expires_at>now() order by verified_at desc limit 1`,
    [input.tenantId, input.userId]
  );
  const callTrustLevel = recentStrongAuth?.rows[0] ? "strong" : "standard";
  const auth = await queryPostgres<{ id: string }>(
    `insert into public.owner_conversation_auth_sessions (
       tenant_id,user_id,conversation_session_id,channel_key,provider_key,provider_session_id,
       authentication_method,trust_level,status,verified_at,expires_at,metadata_json
     ) values ($1,$2,$3,'phone',$4,$5,'verified_outbound_destination',$6,'verified',now(),now()+interval '2 hours',$7::jsonb)
     returning id`,
    [input.tenantId, input.userId, conversationId, provider.providerKey, call.data.providerCallId,
      callTrustLevel,
      JSON.stringify({
        source: "owner_briefing",
        correlationId,
        briefingType: input.briefingType,
        inheritedStrongAuthSessionId: recentStrongAuth?.rows[0]?.id ?? null
      })]
  );
  await queryPostgres(
    `update public.office_manager_conversation_sessions
     set external_session_id=$3,last_message_at=now(),metadata_json=metadata_json || $4::jsonb,updated_at=now()
     where tenant_id=$1 and id=$2`,
    [input.tenantId, conversationId, call.data.providerCallId, JSON.stringify({ ownerAuthSessionId: auth?.rows[0]?.id ?? null })]
  );
  return {
    ok: true as const,
    providerCallId: call.data.providerCallId,
    conversationId,
    authSessionId: auth?.rows[0]?.id ?? null,
    message: "The private owner briefing call is starting."
  };
}
