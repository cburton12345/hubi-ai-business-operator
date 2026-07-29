"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";

const responseSchema = z.object({
  token: z.string().min(20).max(200),
  response: z.enum(["confirmed", "reschedule_requested", "declined"]),
  note: z.string().trim().max(1000).optional()
});

export async function respondToVisitAction(formData: FormData) {
  const parsed = responseSchema.safeParse({
    token: formData.get("token"),
    response: formData.get("response"),
    note: String(formData.get("note") ?? "") || undefined
  });
  if (!parsed.success) return;

  const result = await queryPostgres<{ visit_id: string }>(
    `
    with valid_token as (
      select t.tenant_id, t.visit_id
      from public.service_visit_customer_tokens t
      join public.service_visits v on v.id = t.visit_id and v.tenant_id = t.tenant_id
      where t.public_token = $1 and t.status = 'active'
        and (t.expires_at is null or t.expires_at > now())
        and v.status not in ('completed','canceled','no_show')
      for update
    ),
    updated as (
      update public.service_visits v
      set customer_confirmation_status = $2,
          customer_confirmed_at = case when $2 = 'confirmed' then now() else null end,
          status = case when $2 = 'confirmed' and v.status in ('tentative','scheduled') then 'confirmed' else v.status end,
          updated_at = now()
      from valid_token t
      where v.tenant_id = t.tenant_id and v.id = t.visit_id
      returning v.tenant_id, v.id as visit_id, v.brand_id, v.customer_id, v.location_id, v.work_order_id
    ),
    event as (
      insert into public.service_operating_events (
        tenant_id, brand_id, customer_id, location_id, work_order_id, visit_id,
        event_type, source_type, source_id, title, detail, next_state_json, metadata_json
      )
      select
        u.tenant_id, u.brand_id, u.customer_id, u.location_id, u.work_order_id, u.visit_id,
        'customer_schedule_response', 'customer', u.visit_id::text,
        case $2
          when 'confirmed' then 'Customer confirmed appointment'
          when 'reschedule_requested' then 'Customer requested a different time'
          else 'Customer cannot make this appointment'
        end,
        nullif($3, ''),
        jsonb_build_object('customerConfirmationStatus', $2),
        jsonb_build_object('customerNote', nullif($3, ''), 'requiresTeamReview', $2 <> 'confirmed')
      from updated u
    )
    select visit_id from updated
    `,
    [parsed.data.token, parsed.data.response, parsed.data.note ?? ""]
  );
  if (!result?.rows[0]) return;

  revalidatePath(`/visit/${parsed.data.token}`);
  revalidatePath("/app/schedule");
  revalidatePath("/app");
}
