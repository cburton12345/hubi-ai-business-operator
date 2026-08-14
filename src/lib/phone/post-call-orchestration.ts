import { queryPostgres } from "@/lib/db/postgres";
import { getPushNotificationPreferences, pushPreferencesAllowEvent } from "@/lib/push/preferences";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";

export async function orchestrateCompletedCall(input: {
  tenantId: string;
  callId: string;
  providerCallId: string;
  callerNumber: string | null;
  summary: string;
  status: string;
  outcome: string | null;
  qualification: string;
  actionItems: unknown[];
  shouldInterruptOwner: boolean;
  estimatedValueCents: number;
}) {
  const needsAttention = input.shouldInterruptOwner
    || ["missed", "failed"].includes(input.status)
    || ["followup_needed", "unresolved", "failed"].includes(input.outcome ?? "")
    || ["hot", "warm"].includes(input.qualification)
    || input.actionItems.length > 0;
  if (!needsAttention) return { created: false, pushed: false };
  const severity = input.status === "failed" || input.qualification === "hot" ? "high" : "medium";
  const title = input.status === "missed"
    ? "A caller needs a response"
    : input.qualification === "hot" ? "A high-intent caller needs attention" : "Call follow-up is ready";
  const body = `${input.callerNumber ?? "A caller"}: ${input.summary}`.slice(0, 500);
  const event = await queryPostgres<{ id: string }>(
    `insert into public.owner_command_events (
       tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,
       severity,status,owner_attention,ai_handled,recommended_action,action_href,
       risk_type,confidence_score,metadata_json
     ) values ($1,'ferocity','Ferocity',$2,'call.follow_up_ready',$3,$4,$5,'needs_owner',true,false,
       'Review the call and complete or authorize its next step.',$6,'customer',95,$7::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null do nothing
     returning id`,
    [input.tenantId, `post-call:${input.providerCallId}`, title, body, severity, `/app/calls/${input.callId}`,
      JSON.stringify({ callId: input.callId, providerCallId: input.providerCallId, status: input.status, outcome: input.outcome, actionItems: input.actionItems })]
  );
  if (!event?.rows[0]) return { created: false, pushed: false };
  const preferences = await getPushNotificationPreferences(input.tenantId);
  const allowed = pushPreferencesAllowEvent({
    preferences, severity, status: input.status, ownerAttention: true,
    moneyCents: input.estimatedValueCents, riskType: input.qualification === "hot" ? "revenue" : "customer"
  });
  if (!allowed) return { created: true, pushed: false };
  const push = await sendWorkspacePushNotifications({
    tenantId: input.tenantId, eventType: "call.follow_up_ready", title, body,
    url: `/app/calls/${input.callId}`, tag: `call:${input.callId}`,
    metadata: { callId: input.callId, providerCallId: input.providerCallId }
  });
  return { created: true, pushed: push.sent > 0 };
}
