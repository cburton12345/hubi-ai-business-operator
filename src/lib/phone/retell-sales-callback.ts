import { createPostgresPool } from "@/lib/db/postgres";
import { resolveRetellConfiguration, resolveRetellWebhookTenant } from "@/lib/providers/retell-config";
import { verifyRetellSignature } from "@/lib/providers/voice-adapters";

type JsonRecord = Record<string, unknown>;

export type SalesCallbackRequest = {
  tenantId: string;
  brandId: string | null;
  providerCallId: string;
  callerName: string;
  businessName: string | null;
  callbackNumber: string;
  email: string | null;
  reason: string;
  urgency: "normal" | "high";
  preferredTime: string | null;
};

export type SalesCallbackResult = {
  ok: boolean;
  status: "callback_requested" | "not_recorded";
  requestId?: string;
  message: string;
};

type ToolDependencies = {
  resolveTenant: (agentId: string | null, phoneNumber: string | null) => Promise<string | null>;
  resolveApiKey: (tenantId: string) => Promise<string | null>;
  verifySignature: (rawBody: string, apiKey: string, signature: string | null) => boolean;
  persist: (request: SalesCallbackRequest) => Promise<{ id: string }>;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function cleanText(value: unknown, max = 500) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, max);
  return cleaned || null;
}

function cleanPhone(value: unknown) {
  const phone = cleanText(value, 40);
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? phone : null;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 254);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function cleanUuid(value: unknown) {
  const candidate = cleanText(value, 36);
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function phoneFromCall(call: JsonRecord) {
  return cleanText(call.to_number ?? call.from_number, 40);
}

export async function processRetellSalesCallbackTool(
  rawBody: string,
  signature: string | null,
  dependencies: ToolDependencies
): Promise<SalesCallbackResult> {
  let payload: JsonRecord;
  try {
    payload = JSON.parse(rawBody || "{}") as JsonRecord;
  } catch {
    return { ok: false, status: "not_recorded", message: "The callback request could not be recorded because the request was invalid." };
  }

  if (cleanText(payload.name, 80) !== "create_sales_callback") {
    return { ok: false, status: "not_recorded", message: "The requested phone action is not supported." };
  }

  const call = record(payload.call);
  const args = record(payload.args);
  const agentId = cleanText(call.agent_id, 200);
  const providerCallId = cleanText(call.call_id, 200);
  const tenantId = await dependencies.resolveTenant(agentId, phoneFromCall(call));
  if (!tenantId || !providerCallId) {
    return { ok: false, status: "not_recorded", message: "The callback request could not be connected to a Ferocity workspace." };
  }

  const apiKey = await dependencies.resolveApiKey(tenantId);
  if (!apiKey || !dependencies.verifySignature(rawBody, apiKey, signature)) {
    return { ok: false, status: "not_recorded", message: "The callback request could not be authenticated." };
  }

  const callerName = cleanText(args.caller_name, 160);
  const callbackNumber = cleanPhone(args.callback_number);
  const reason = cleanText(args.reason, 1000);
  if (!callerName || !callbackNumber || !reason) {
    return {
      ok: false,
      status: "not_recorded",
      message: "The callback request is missing the caller's name, callback number, or reason. Collect the missing detail before confirming anything."
    };
  }

  try {
    const saved = await dependencies.persist({
      tenantId,
      brandId: cleanUuid(record(call.metadata).ferocityBrandId ?? record(call.metadata).brandId),
      providerCallId,
      callerName,
      businessName: cleanText(args.business_name, 200),
      callbackNumber,
      email: cleanEmail(args.email),
      reason,
      urgency: cleanText(args.urgency, 20)?.toLowerCase() === "high" ? "high" : "normal",
      preferredTime: cleanText(args.preferred_time, 200)
    });
    return {
      ok: true,
      status: "callback_requested",
      requestId: saved.id,
      message: "The callback request is recorded in Ferocity. Do not promise an exact callback time unless a team member has explicitly confirmed one."
    };
  } catch {
    return {
      ok: false,
      status: "not_recorded",
      message: "Ferocity could not record the callback request. Do not say it is scheduled; offer support@ferocity.live instead."
    };
  }
}

export async function persistRetellSalesCallback(input: SalesCallbackRequest) {
  const pool = createPostgresPool();
  if (!pool) throw new Error("Database is not configured.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${input.tenantId}:retell_sales_callback:${input.providerCallId}`
    ]);

    const brand = await client.query<{ id: string }>(
      `
      select id
      from public.brands
      where tenant_id = $1 and status = 'active'
        and ($2::uuid is null or id = $2::uuid)
      order by case when id = $2::uuid then 0 else 1 end, created_at
      limit 1
      `,
      [input.tenantId, input.brandId]
    );
    const trustedBrandId = brand.rows[0]?.id ?? null;

    const existing = await client.query<{ id: string }>(
      `
      select id
      from public.operator_schedule_events
      where tenant_id = $1
        and event_type = 'callback'
        and metadata_json->>'source' = 'retell_sales_callback_tool'
        and metadata_json->>'providerCallId' = $2
      limit 1
      `,
      [input.tenantId, input.providerCallId]
    );
    let requestId = existing.rows[0]?.id ?? null;

    if (!requestId) {
      const inserted = await client.query<{ id: string }>(
        `
        insert into public.operator_schedule_events (
          tenant_id, brand_id, event_type, title, status, starts_at,
          reminder_policy_json, metadata_json
        )
        values (
          $1, $2, 'callback', $3, 'scheduled', now(),
          '{"manualReminder":true,"ownerQueue":true}'::jsonb, $4::jsonb
        )
        returning id
        `,
        [
          input.tenantId,
          trustedBrandId,
          `Sales callback requested: ${input.callerName}`,
          JSON.stringify({
            source: "retell_sales_callback_tool",
            provider: "retell_voice",
            providerCallId: input.providerCallId,
            callerName: input.callerName,
            businessName: input.businessName,
            callbackNumber: input.callbackNumber,
            email: input.email,
            reason: input.reason,
            urgency: input.urgency,
            preferredTime: input.preferredTime,
            timingConfirmed: false
          })
        ]
      );
      requestId = inserted.rows[0]?.id ?? null;
    }
    if (!requestId) throw new Error("Callback record was not created.");

    await client.query(
      `
      update public.receptionist_calls
      set follow_up_status = 'created',
          outcome = coalesce(outcome, 'followup_needed'),
          action_items_json = case
            when action_items_json @> '["Sales callback requested"]'::jsonb then action_items_json
            else action_items_json || '["Sales callback requested"]'::jsonb
          end,
          metadata_json = metadata_json || jsonb_build_object('salesCallbackRequestId', $3::text),
          updated_at = now()
      where tenant_id = $1 and provider_key = 'retell_voice' and provider_call_id = $2
      `,
      [input.tenantId, input.providerCallId, requestId]
    );

    await client.query(
      `
      insert into public.operator_timeline_events (
        tenant_id, event_family, event_type, title, body, metadata_json
      )
      select $1, 'ai', 'voice.sales_callback_requested', $2, $3, $4::jsonb
      where not exists (
        select 1 from public.operator_timeline_events
        where tenant_id = $1
          and event_type = 'voice.sales_callback_requested'
          and metadata_json->>'providerCallId' = $5
      )
      `,
      [
        input.tenantId,
        `Sales callback requested by ${input.callerName}`,
        input.reason,
        JSON.stringify({
          source: "retell_sales_callback_tool",
          providerCallId: input.providerCallId,
          callbackRequestId: requestId,
          urgency: input.urgency
        }),
        input.providerCallId
      ]
    );
    await client.query("commit");
    return { id: requestId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export const retellSalesCallbackDependencies: ToolDependencies = {
  resolveTenant: resolveRetellWebhookTenant,
  resolveApiKey: async (tenantId) => (await resolveRetellConfiguration(tenantId, false))?.apiKey ?? null,
  verifySignature: verifyRetellSignature,
  persist: persistRetellSalesCallback
};
