"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";

const requestSchema = z.object({
  token: z.string().min(20).max(160),
  requestType: z.enum(["service", "reschedule", "cancel", "estimate_change", "billing", "document", "other"]),
  subject: z.string().trim().min(2).max(180),
  details: z.string().trim().max(3000).optional(),
  preferredStart: z.string().optional()
});

const messageSchema = z.object({
  token: z.string().min(20).max(160),
  body: z.string().trim().min(1).max(3000)
});

async function resolveAccess(token: string) {
  const result = await queryPostgres<{ tenant_id: string; customer_id: string }>(
    `
    select tenant_id, customer_id
    from public.customer_portal_access
    where public_token = $1 and enabled = true and (expires_at is null or expires_at > now())
    limit 1
    `,
    [token]
  );
  return result?.rows[0] ?? null;
}

export async function createPortalRequestAction(formData: FormData) {
  const parsed = requestSchema.safeParse({
    token: formData.get("token"),
    requestType: formData.get("requestType"),
    subject: formData.get("subject"),
    details: String(formData.get("details") ?? ""),
    preferredStart: String(formData.get("preferredStart") ?? "")
  });
  if (!parsed.success) return;
  const access = await resolveAccess(parsed.data.token);
  if (!access) redirect(`/portal/${parsed.data.token}?error=access`);

  await queryPostgres(
    `
    with created as (
      insert into public.customer_portal_requests (
        tenant_id, customer_id, request_type, subject, details, preferred_start
      ) values ($1, $2, $3, $4, $5, $6)
      returning id
    )
    insert into public.service_operating_events (
      tenant_id, customer_id, event_type, source_type, title, metadata_json
    )
    select $1, $2, 'portal_request_created', 'customer', $4,
      jsonb_build_object('portal_request_id', id, 'request_type', $3)
    from created
    `,
    [
      access.tenant_id, access.customer_id, parsed.data.requestType, parsed.data.subject,
      parsed.data.details || null, parsed.data.preferredStart ? new Date(parsed.data.preferredStart) : null
    ]
  );
  redirect(`/portal/${parsed.data.token}?success=request`);
}

export async function sendPortalMessageAction(formData: FormData) {
  const parsed = messageSchema.safeParse({ token: formData.get("token"), body: formData.get("body") });
  if (!parsed.success) return;
  const access = await resolveAccess(parsed.data.token);
  if (!access) redirect(`/portal/${parsed.data.token}?error=access`);
  await queryPostgres(
    `
    insert into public.customer_portal_messages (tenant_id, customer_id, direction, body)
    values ($1, $2, 'customer', $3)
    `,
    [access.tenant_id, access.customer_id, parsed.data.body]
  );
  await queryPostgres(
    `
    insert into public.service_operating_events (tenant_id, customer_id, event_type, source_type, title)
    values ($1, $2, 'portal_message_received', 'customer', 'Customer sent a portal message.')
    `,
    [access.tenant_id, access.customer_id]
  );
  redirect(`/portal/${parsed.data.token}?success=message`);
}
