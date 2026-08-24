import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";

const requestSchema = z.object({
  companyCode: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(80).optional(),
  preferredLanguage: z.enum(["en", "es"]),
  website: z.string().max(0).optional()
});

export async function POST(request: NextRequest) {
  const limit = await consumePublicRateLimit({
    request,
    scope: "employee-access-request",
    limit: 10,
    windowSeconds: 60 * 60
  });
  if (!limit.allowed) {
    return NextResponse.redirect(new URL("/employee/join?error=limit", request.url), 303);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.redirect(new URL("/employee/join?error=invalid", request.url), 303);
  }
  const parsed = requestSchema.safeParse({
    companyCode: formData.get("companyCode"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: String(formData.get("phone") ?? ""),
    preferredLanguage: formData.get("preferredLanguage") ?? "en",
    website: String(formData.get("website") ?? "")
  });
  if (!parsed.success || parsed.data.website) {
    return NextResponse.redirect(new URL("/employee/join?error=invalid", request.url), 303);
  }

  const tenantResult = await queryPostgres<{ id: string; name: string }>(
    `select id, name from public.tenants where lower(slug) = lower($1) and status = 'active' limit 1`,
    [parsed.data.companyCode]
  );
  const tenant = tenantResult?.rows[0];
  if (!tenant) {
    return NextResponse.redirect(new URL(`/employee/join?error=company&company=${encodeURIComponent(parsed.data.companyCode)}`, request.url), 303);
  }

  const result = await queryPostgres<{ id: string }>(
    `insert into public.employee_access_requests (
       tenant_id, name, email, phone, preferred_language, metadata_json
     ) values ($1,$2,lower($3),$4,$5,$6::jsonb)
     on conflict (tenant_id, lower(email)) where status = 'pending' do update
     set name = excluded.name, phone = excluded.phone, preferred_language = excluded.preferred_language,
         metadata_json = public.employee_access_requests.metadata_json || excluded.metadata_json,
         updated_at = now()
     returning id`,
    [
      tenant.id,
      parsed.data.name,
      parsed.data.email,
      parsed.data.phone || null,
      parsed.data.preferredLanguage,
      JSON.stringify({ source: "employee_self_service", approvalRequired: true })
    ]
  );
  const accessRequestId = result?.rows[0]?.id;
  if (!accessRequestId) {
    return NextResponse.redirect(new URL("/employee/join?error=unavailable", request.url), 303);
  }

  await queryPostgres(
    `insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, ai_summary, recommended_action,
      action_href, risk_type, confidence_score, metadata_json
    ) values ($1, 'ferocity-workforce', 'Ferocity Workforce', $2, 'employee.access.requested', $3, $4,
      'medium', 'needs_owner', true, false, $5, $6, '/app/operations-workforce', 'approval', 96, $7::jsonb)
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
    set title = excluded.title, summary = excluded.summary, status = 'needs_owner', owner_attention = true,
        metadata_json = excluded.metadata_json, occurred_at = now(), updated_at = now()`,
    [
      tenant.id,
      `employee-access-request-${accessRequestId}`,
      `${parsed.data.name} requested employee access`,
      `${parsed.data.name} used the company code and requested access with ${parsed.data.email}. No company data has been shared.`,
      "Ferocity held the request for an authorized company user instead of linking it automatically.",
      "Approve or decline the request in Workforce.",
      JSON.stringify({ accessRequestId, email: parsed.data.email, preferredLanguage: parsed.data.preferredLanguage })
    ]
  );

  const owners = await queryPostgres<{ email: string }>(
    `select distinct users.email
     from public.tenant_users membership
     join public.users users on users.id = membership.user_id
     where membership.tenant_id = $1 and membership.status = 'active'
       and membership.role in ('owner','admin') and users.email is not null
     limit 5`,
    [tenant.id]
  );
  await Promise.all((owners?.rows ?? []).map((owner) => sendTransactionalEmail({
    to: owner.email,
    subject: `${parsed.data.name} requested employee access`,
    text: `${parsed.data.name} (${parsed.data.email}) requested employee access to ${tenant.name}.\n\nFerocity has not shared company data or granted access. Review and approve or decline the request in Workforce:\n${new URL("/app/operations-workforce", request.url).toString()}`,
    tenantId: tenant.id,
    eventKey: "employee_access_requested",
    metadata: { accessRequestId }
  })));

  return NextResponse.redirect(new URL(`/employee/join?requested=1&lang=${parsed.data.preferredLanguage}`, request.url), 303);
}
