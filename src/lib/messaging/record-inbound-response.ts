import { queryPostgres } from "@/lib/db/postgres";

export type InboundResponseInput = {
  tenantId: string;
  brandId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  sourceThreadId?: string | null;
  externalConversationRef?: string | null;
  sourceMessageId?: string | null;
  channel: "sms" | "mms" | "email" | "phone" | "website_chat" | "app_push";
  providerKey: string;
  providerMessageId?: string | null;
  from: string;
  to?: string | null;
  subject?: string | null;
  body: string;
};

/**
 * Records a provider-verified inbound response in the canonical inbox and
 * deterministically stops pending outreach to that person.
 */
export async function recordInboundResponse(input: InboundResponseInput) {
  const conversationResult = await queryPostgres<{ id: string }>(
    `
    insert into public.messaging_conversations (
      tenant_id, brand_id, lead_id, customer_id, channel, provider_key,
      external_conversation_ref, source_thread_id, subject, status, unread_count,
      first_response_due_at, last_message_at, last_inbound_at, metadata_json
    )
    values (
      $1, $2, $3, $4, $5, $6,
      coalesce($11, $9::text, $7, $6 || ':' || lower($8)), $9::uuid, coalesce($10, 'Customer conversation'),
      'waiting_on_team', 1, now() + interval '15 minutes', now(), now(),
      jsonb_build_object('lastInboundContact', $8)
    )
    on conflict (tenant_id, provider_key, external_conversation_ref)
    do update set
      lead_id = coalesce(excluded.lead_id, public.messaging_conversations.lead_id),
      customer_id = coalesce(excluded.customer_id, public.messaging_conversations.customer_id),
      source_thread_id = coalesce(excluded.source_thread_id, public.messaging_conversations.source_thread_id),
      status = 'waiting_on_team',
      unread_count = public.messaging_conversations.unread_count + 1,
      first_response_due_at = coalesce(public.messaging_conversations.first_response_due_at, now() + interval '15 minutes'),
      last_message_at = now(),
      last_inbound_at = now(),
      metadata_json = public.messaging_conversations.metadata_json || excluded.metadata_json,
      updated_at = now()
    returning id
    `,
    [
      input.tenantId, input.brandId ?? null, input.leadId ?? null, input.customerId ?? null,
      input.channel, input.providerKey, input.providerMessageId ?? null, input.from,
      input.sourceThreadId ?? null, input.subject ?? null, input.externalConversationRef ?? null
    ]
  );
  const conversationId = conversationResult?.rows[0]?.id;
  if (!conversationId) return null;

  await queryPostgres(
    `
    insert into public.messages (
      tenant_id, conversation_id, source_message_id, direction, channel, provider_key,
      provider_message_ref, from_value, to_value, subject, body, status, received_at, metadata_json
    )
    values ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9, $10, 'received', now(),
      jsonb_build_object('normalizedBy', 'recordInboundResponse'))
    on conflict (tenant_id, source_message_id) where source_message_id is not null do nothing
    `,
    [
      input.tenantId, conversationId, input.sourceMessageId ?? null, input.channel,
      input.providerKey, input.providerMessageId ?? null, input.from, input.to ?? null,
      input.subject ?? null, input.body
    ]
  );

  await queryPostgres(
    `
    insert into public.customer_response_stops (
      tenant_id, conversation_id, lead_id, customer_id, contact_channel, contact_value, reason
    )
    values ($1, $2, $3, $4, $5, $6, 'customer_replied')
    on conflict (tenant_id, contact_channel, lower(contact_value)) where active = true
    do update set conversation_id = excluded.conversation_id, lead_id = coalesce(excluded.lead_id, public.customer_response_stops.lead_id),
      customer_id = coalesce(excluded.customer_id, public.customer_response_stops.customer_id),
      triggered_at = now(), metadata_json = public.customer_response_stops.metadata_json || jsonb_build_object('latestConversationId', excluded.conversation_id)
    `,
    [input.tenantId, conversationId, input.leadId ?? null, input.customerId ?? null, input.channel, input.from]
  );

  await Promise.all([
    queryPostgres(
      `
      update public.outbound_action_queue
      set status = 'canceled', last_error = 'Stopped because the customer replied.',
        metadata_json = metadata_json || jsonb_build_object('stoppedOnResponse', true, 'conversationId', $2::text),
        updated_at = now()
      where tenant_id = $1
        and status in ('draft', 'needs_review', 'approved', 'queued', 'failed')
        and lower(recipient_label) = lower($3)
      `,
      [input.tenantId, conversationId, input.from]
    ),
    queryPostgres(
      `
      update public.revenue_followup_enrollments
      set status = 'stopped', stop_reason = 'customer_replied',
        metadata_json = metadata_json || jsonb_build_object('stoppedByConversationId', $2::text),
        updated_at = now()
      where tenant_id = $1 and status = 'active'
        and (($3::uuid is not null and lead_id = $3) or ($4::uuid is not null and customer_id = $4))
      `,
      [input.tenantId, conversationId, input.leadId ?? null, input.customerId ?? null]
    ),
    queryPostgres(
      `
      update public.follow_up_workflows
      set status = 'canceled',
        metadata_json = metadata_json || jsonb_build_object('stoppedOnResponse', true, 'conversationId', $2::text),
        updated_at = now()
      where tenant_id = $1 and status in ('open', 'scheduled')
        and (($3::uuid is not null and lead_id = $3) or ($4::uuid is not null and customer_id = $4))
      `,
      [input.tenantId, conversationId, input.leadId ?? null, input.customerId ?? null]
    ),
    queryPostgres(
      `
      insert into public.conversation_state_events (
        tenant_id, conversation_id, event_type, actor_type, summary
      ) values ($1, $2, 'inbound_received', 'customer',
        'Customer response recorded; matching pending nurture and follow-up were stopped.')
      `,
      [input.tenantId, conversationId]
    )
  ]);
  return conversationId;
}
