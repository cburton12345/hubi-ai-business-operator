import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { raisePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";

export async function createSupportIssue(input: {
  tenantId?: string | null;
  source: "public_form" | "customer_portal" | "internal" | "voice_agent";
  issueType: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  severity?: "low" | "normal" | "high";
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await queryPostgres<{ id: string }>(
    `insert into public.support_issue_queue (
       tenant_id, source, issue_type, status, severity, requester_name, requester_email,
       requester_phone, subject, message, metadata_json
     ) values ($1,$2,$3,'open',$4,$5,lower($6),$7,$8,$9,$10::jsonb)
     returning id`,
    [
      input.tenantId ?? null,
      input.source,
      input.issueType.slice(0, 80),
      input.severity ?? "normal",
      input.requesterName || null,
      input.requesterEmail || null,
      input.requesterPhone || null,
      input.subject,
      input.message,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  const issueId = result?.rows[0]?.id;
  if (!issueId) throw new Error("Ferocity could not create the support request.");

  if (input.tenantId) {
    await queryPostgres(
      `insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
        action_href, risk_type, confidence_score, metadata_json
      ) values ($1,'ferocity-support','Ferocity Support',$2,'support.requested',$3,$4,
        'medium','in_progress',false,true,$5,$6,'/app/support','support',100,$7::jsonb)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do nothing`,
      [
        input.tenantId,
        `support-${issueId}`,
        `Support request received: ${input.subject}`,
        "Ferocity recorded the request and notified the support team.",
        "The support request is safely queued and trackable.",
        "Watch this request in Support; Ferocity will keep the history together.",
        JSON.stringify({ supportIssueId: issueId, issueType: input.issueType })
      ]
    );
  }

  const tasks: Array<Promise<unknown>> = [
    raisePlatformAdminAlert({
      fingerprint: `support-request:${issueId}`,
      family: "customer_support",
      type: "support_requested",
      severity: "high",
      title: `Customer support request: ${input.subject}`,
      body: `${input.requesterName || input.requesterEmail || input.requesterPhone || "A caller"} needs help. The request is recorded in Ferocity's support queue.`,
      tenantId: input.tenantId,
      actionUrl: "/app/platform-activity#support",
      metadata: { supportIssueId: issueId, issueType: input.issueType, requesterEmail: input.requesterEmail ?? null, requesterPhone: input.requesterPhone ?? null }
    })
  ];
  if (input.requesterEmail) {
    tasks.push(sendTransactionalEmail({
      to: input.requesterEmail,
      subject: "Ferocity received your support request",
      text: `We received your request: ${input.subject}\n\nReference: ${issueId}\n\nYou do not need to submit it again. If you need to add context, email support@ferocity.live and include this reference. Do not send passwords, verification codes, or full payment information.`,
      tenantId: input.tenantId,
      eventKey: `support-confirmation-${issueId}`,
      metadata: { supportIssueId: issueId }
    }));
  }
  await Promise.all(tasks);

  return { issueId };
}
