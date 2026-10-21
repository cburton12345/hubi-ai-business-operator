"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { consumeLoginRateLimit } from "@/lib/security/rate-limit";
import { hashCustomerPortalToken } from "@/lib/service-ops/customer-portal-token";

const requestSchema = z.object({
  token: z.string().min(20).max(160),
  requestType: z.enum(["service", "reschedule", "cancel", "estimate_change", "billing", "document", "other"]),
  subject: z.string().trim().min(2).max(180),
  details: z.string().trim().max(3000).optional(),
  preferredStart: z.string().datetime({ local: true }).optional().or(z.literal("")),
  idempotencyKey: z.string().uuid()
});

const messageSchema = z.object({
  token: z.string().min(20).max(160),
  body: z.string().trim().min(1).max(3000),
  idempotencyKey: z.string().uuid()
});

async function resolveAccess(token: string) {
  const tokenHash = hashCustomerPortalToken(token);
  const result = await queryPostgres<{ tenant_id: string; customer_id: string }>(
    `
    select tenant_id, customer_id
    from public.customer_portal_access
    where token_hash = $1 and enabled = true and (expires_at is null or expires_at > now())
    limit 1
    `,
    [tokenHash]
  );
  return result?.rows[0] ?? null;
}

async function portalRateLimit(token: string, kind: "request" | "message") {
  const requestHeaders = await headers();
  return consumeLoginRateLimit({
    scope: `customer-portal:${kind}`,
    identifier: hashCustomerPortalToken(token),
    clientHint: `${requestHeaders.get("x-forwarded-for") ?? "unknown"}|${requestHeaders.get("user-agent") ?? ""}`,
    limit: kind === "request" ? 6 : 20,
    windowSeconds: 600
  });
}

export async function createPortalRequestAction(formData: FormData) {
  const parsed = requestSchema.safeParse({
    token: formData.get("token"),
    requestType: formData.get("requestType"),
    subject: formData.get("subject"),
    details: String(formData.get("details") ?? ""),
    preferredStart: String(formData.get("preferredStart") ?? ""),
    idempotencyKey: formData.get("idempotencyKey")
  });
  if (!parsed.success) return;
  const access = await resolveAccess(parsed.data.token);
  if (!access) redirect(`/portal/${parsed.data.token}?error=access`);
  const rate = await portalRateLimit(parsed.data.token, "request");
  if (!rate.allowed) redirect(`/portal/${parsed.data.token}?error=rate-limit`);

  const persisted = await queryPostgres<{ accepted: boolean }>(
    `
    with created as (
      insert into public.customer_portal_requests (
        tenant_id, customer_id, request_type, subject, details, preferred_start, idempotency_key
      ) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (tenant_id,customer_id,idempotency_key) where idempotency_key is not null do nothing
      returning id
    ), event as (
      insert into public.service_operating_events (
        tenant_id, customer_id, event_type, source_type, title, metadata_json
      )
      select $1, $2, 'portal_request_created', 'customer', $4,
        jsonb_build_object('portal_request_id', id, 'request_type', $3)
      from created returning id
    )
    select exists(
      select 1 from public.customer_portal_requests
      where tenant_id=$1 and customer_id=$2 and idempotency_key=$7
    ) as accepted
    `,
    [
      access.tenant_id, access.customer_id, parsed.data.requestType, parsed.data.subject,
      parsed.data.details || null, parsed.data.preferredStart ? new Date(parsed.data.preferredStart) : null,
      parsed.data.idempotencyKey
    ]
  );
  if (!persisted?.rows[0]?.accepted) redirect(`/portal/${parsed.data.token}?error=save`);
  redirect(`/portal/${parsed.data.token}?success=request`);
}

export async function sendPortalMessageAction(formData: FormData) {
  const parsed = messageSchema.safeParse({ token: formData.get("token"), body: formData.get("body"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) return;
  const access = await resolveAccess(parsed.data.token);
  if (!access) redirect(`/portal/${parsed.data.token}?error=access`);
  const rate = await portalRateLimit(parsed.data.token, "message");
  if (!rate.allowed) redirect(`/portal/${parsed.data.token}?error=rate-limit`);
  const persisted = await queryPostgres<{ accepted: boolean }>(
    `
    with created as (
      insert into public.customer_portal_messages (tenant_id, customer_id, direction, body, idempotency_key)
      values ($1, $2, 'customer', $3, $4)
      on conflict (tenant_id,customer_id,idempotency_key) where idempotency_key is not null do nothing
      returning id
    ), event as (
      insert into public.service_operating_events (tenant_id, customer_id, event_type, source_type, title)
      select $1, $2, 'portal_message_received', 'customer', 'Customer sent a portal message.'
      from created returning id
    )
    select exists(
      select 1 from public.customer_portal_messages
      where tenant_id=$1 and customer_id=$2 and idempotency_key=$4
    ) as accepted
    `,
    [access.tenant_id, access.customer_id, parsed.data.body, parsed.data.idempotencyKey]
  );
  if (!persisted?.rows[0]?.accepted) redirect(`/portal/${parsed.data.token}?error=save`);
  redirect(`/portal/${parsed.data.token}?success=message`);
}
