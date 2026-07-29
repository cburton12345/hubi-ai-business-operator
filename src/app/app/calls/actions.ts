"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { saveScopedPreference, type SavedPreferenceScope } from "@/lib/preferences/saved-preferences";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const responseSchema = z.object({
  callId: z.string().uuid(),
  response: z.enum(["accept", "decline", "voicemail", "return_to_ai", "transfer_employee", "schedule_callback"]),
  target: z.string().trim().max(120),
  remember: z.enum(["one_time", "customer", "workflow", "user", "organization"])
});

export async function respondToCallScreeningAction(formData: FormData) {
  await requirePermission("ai:queue");
  const parsed = responseSchema.safeParse({
    callId: formData.get("callId"),
    response: formData.get("response"),
    target: formData.get("target") ?? "",
    remember: formData.get("remember") ?? "one_time"
  });
  if (!parsed.success) return;
  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const result = await queryPostgres<{
    decision_id: string;
    priority_class: string;
    customer_id: string | null;
    lead_id: string | null;
    provider_key: string;
  }>(
    `select d.id as decision_id, d.priority_class, c.customer_id, c.lead_id, c.provider_key
     from public.call_management_decisions d
     join public.receptionist_calls c on c.tenant_id=d.tenant_id and c.id=d.call_id
     where d.tenant_id=$1 and d.call_id=$2 limit 1`,
    [tenantId, parsed.data.callId]
  );
  const call = result?.rows[0];
  if (!call) return;

  const finalStatus = parsed.data.response === "decline" ? "declined" : "accepted";
  await queryPostgres(
    `update public.call_management_decisions
     set owner_response=$3, response_target=nullif($4,''), status=$5,
       provider_execution_status='awaiting_connected_provider',
       responded_by_user_id=nullif($6::text,'')::uuid, responded_at=now(), updated_at=now()
     where tenant_id=$1 and call_id=$2`,
    [tenantId, parsed.data.callId, parsed.data.response, parsed.data.target, finalStatus, session?.userId ?? ""]
  );
  await queryPostgres(
    `insert into public.receptionist_call_events (
       tenant_id, call_id, provider_key, provider_event_id, event_type, event_status, metadata_json
     ) values ($1,$2,$3,$4,'call_management.owner_response','recorded',$5::jsonb)
     on conflict (tenant_id, provider_key, provider_event_id) do nothing`,
    [
      tenantId,
      parsed.data.callId,
      call.provider_key,
      `owner-response:${call.decision_id}:${Date.now()}`,
      JSON.stringify({
        response: parsed.data.response,
        target: parsed.data.target || null,
        execution: "awaiting_connected_provider"
      })
    ]
  );

  let scope: SavedPreferenceScope | null = null;
  if (parsed.data.remember === "customer") {
    scope = call.customer_id
      ? { type: "contact", key: `customer:${call.customer_id}` }
      : call.lead_id
        ? { type: "contact", key: `lead:${call.lead_id}` }
        : null;
  } else if (parsed.data.remember === "workflow") {
    scope = { type: "workflow", key: "inbound_call" };
  } else if (parsed.data.remember === "user" && session?.userId) {
    scope = { type: "user", key: session.userId };
  } else if (parsed.data.remember === "organization") {
    scope = { type: "organization", key: "default" };
  }
  if (scope) {
    await saveScopedPreference({
      tenantId,
      domain: "call_management",
      key: `priority_action:${call.priority_class}`,
      scope,
      value: { response: parsed.data.response, target: parsed.data.target || null },
      userId: session?.userId,
      metadata: { changedInline: true, sourceCallId: parsed.data.callId }
    });
  }
  revalidatePath("/app/calls");
  revalidatePath("/app/office-manager");
}
