import { NextRequest, NextResponse } from "next/server";
import { queryPostgres } from "@/lib/db/postgres";
import { resolveRetellConfiguration, resolveRetellWebhookTenant } from "@/lib/providers/retell-config";
import { verifyRetellSignature } from "@/lib/providers/voice-adapters";
import { evaluateVoiceAccess } from "@/lib/usage/managed-voice";
import { prepareInboundCallContext } from "@/lib/phone/inbound-call-context";

export const dynamic = "force-dynamic";

type RetellInboundPayload = {
  event?: string;
  call_inbound?: {
    from_number?: string;
    to_number?: string;
  };
};

function rejectCall(reason: string) {
  return NextResponse.json({
    call_inbound: {
      metadata: {
        ferocityAccepted: false,
        reason
      }
    }
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: RetellInboundPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as RetellInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (payload.event !== "call_inbound" || !payload.call_inbound?.to_number) {
    return rejectCall("unsupported_event");
  }

  const tenantId = await resolveRetellWebhookTenant(null, payload.call_inbound.to_number);
  if (!tenantId) return rejectCall("number_not_configured");
  const configuration = await resolveRetellConfiguration(tenantId, false);
  if (
    !configuration
    || !verifyRetellSignature(rawBody, configuration.webhookApiKey, request.headers.get("x-retell-signature"))
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const accountResult = await queryPostgres<{ assistant_id: string | null; brand_id: string | null }>(
    `
    select
      nullif(metadata_json->>'assistantId', '') as assistant_id,
      nullif(metadata_json->>'brandId', '') as brand_id
    from public.provider_accounts
    where tenant_id = $1 and provider_key = 'retell_voice'
    limit 1
    `,
    [tenantId]
  );
  const account = accountResult?.rows[0];
  if (!account?.assistant_id) return rejectCall("assistant_not_ready");

  const access = await evaluateVoiceAccess({
    tenantId,
    providerKey: "retell_voice",
    purpose: "production",
    callDirection: "inbound"
  });
  if (!access.allowed) return rejectCall(access.errorCategory);
  const callContext = await prepareInboundCallContext({
    tenantId,
    callerNumber: payload.call_inbound.from_number,
    brandId: account.brand_id
  });

  return NextResponse.json({
    call_inbound: {
      override_agent_id: account.assistant_id,
      retell_llm_dynamic_variables: {
        ...(callContext?.variables ?? {}),
        ferocity_call_mode: access.restrictedMode ?? "full_service",
        ferocity_call_mode_instruction: access.restrictedMode === "take_message_only"
          ? "Take a concise message and callback details only. Do not transfer, book, send, purchase, or promise follow-up timing."
          : "Use the authorized Ferocity tools and business rules for this call."
      },
      agent_override: {
        agent: {
          max_call_duration_ms: access.maxDurationSeconds * 1000
        }
      },
      metadata: {
        ferocityTenantId: tenantId,
        ferocityBrandId: callContext?.brandId ?? account.brand_id,
        ferocityCustomerId: callContext?.customerId ?? null,
        ferocityLeadId: callContext?.leadId ?? null,
        ferocityOwnershipMode: access.ownershipMode,
        ferocityAccepted: true
      }
    }
  });
}
