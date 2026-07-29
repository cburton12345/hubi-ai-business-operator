import { randomUUID } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

export type FunnelOperationsInput = {
  tenantId: string;
  brandId: string | null;
  campaignId: string;
  funnelName: string;
  serviceLabel: string | null;
  qualificationQuestions: string[];
  followUpPlan: string[];
};

export type FunnelOperationsResult = {
  qualificationFormId: string | null;
  publicFormKey: string | null;
  followupSequenceId: string | null;
};

function cleanLines(values: string[], fallback: string[], limit: number) {
  const cleaned = values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);
  return cleaned.length ? cleaned : fallback;
}

export async function activateFunnelOperations(input: FunnelOperationsInput): Promise<FunnelOperationsResult> {
  const existingForm = await queryPostgres<{ id: string }>(
    `
    select id
    from public.revenue_qualification_forms
    where tenant_id = $1
      and metadata_json->>'campaignId' = $2
      and status <> 'archived'
    limit 1
    `,
    [input.tenantId, input.campaignId]
  );
  let qualificationFormId = existingForm?.rows[0]?.id ?? null;
  let publicFormKey: string | null = null;

  if (!qualificationFormId) {
    const formResult = await queryPostgres<{ id: string }>(
      `
      insert into public.revenue_qualification_forms (
        tenant_id, brand_id, name, service_label, status,
        disqualification_rules_json, routing_rules_json, metadata_json
      )
      values (
        $1, nullif($2::text, '')::uuid, $3, $4, 'active',
        '["Outside service area","No usable contact information","Spam or duplicate"]'::jsonb,
        '["High urgency goes to the owner","Qualified requests enter follow-up","Incomplete requests stay visible for nurture"]'::jsonb,
        $5::jsonb
      )
      returning id
      `,
      [
        input.tenantId,
        input.brandId ?? "",
        `${input.funnelName} qualification`,
        input.serviceLabel,
        JSON.stringify({ createdBy: "ad_autopilot_package", campaignId: input.campaignId })
      ]
    );
    qualificationFormId = formResult?.rows[0]?.id ?? null;
  }

  if (qualificationFormId) {
    const questions = cleanLines(
      input.qualificationQuestions,
      [
        "What do you need help with?",
        "Where are you located?",
        "How soon do you need help?",
        "What result matters most?",
        "What is the best way to reach you?"
      ],
      7
    );
    for (const [index, label] of questions.entries()) {
      await queryPostgres(
        `
        insert into public.revenue_qualification_questions (
          tenant_id, form_id, question_order, label, question_type, required, scoring_json, metadata_json
        )
        select $1, $2, $3, $4, 'text', $5, $6::jsonb, $7::jsonb
        where not exists (
          select 1
          from public.revenue_qualification_questions
          where tenant_id = $1 and form_id = $2 and question_order = $3
        )
        `,
        [
          input.tenantId,
          qualificationFormId,
          index + 1,
          label,
          index < 3,
          JSON.stringify({ scoreIfAnswered: index < 3 ? 15 : 8 }),
          JSON.stringify({ createdBy: "ad_autopilot_package", campaignId: input.campaignId })
        ]
      );
    }

    const publicForm = await queryPostgres<{ id: string; public_key: string }>(
      `
      insert into public.forms (tenant_id, brand_id, name, slug, public_key, active)
      select $1, b.id, $2, $3, $4, true
      from public.brands b
      where b.tenant_id = $1
        and b.id = coalesce(nullif($5::text, '')::uuid, (
          select id from public.brands where tenant_id = $1 and status = 'active' order by created_at limit 1
        ))
      on conflict (brand_id, slug) do update
      set name = excluded.name,
          active = true
      returning id, public_key
      `,
      [
        input.tenantId,
        `${input.funnelName} qualification`,
        `funnel-${input.campaignId}`,
        `funnel_${randomUUID().replaceAll("-", "")}`,
        input.brandId ?? ""
      ]
    );
    const connectedForm = publicForm?.rows[0];
    publicFormKey = connectedForm?.public_key ?? null;
    if (connectedForm) {
      await queryPostgres(
        `
        update public.revenue_qualification_forms
        set metadata_json = metadata_json || $3::jsonb,
            updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [
          input.tenantId,
          qualificationFormId,
          JSON.stringify({
            publicFormId: connectedForm.id,
            publicFormKey: connectedForm.public_key,
            publicPath: `/forms/${connectedForm.public_key}`
          })
        ]
      );
    }
  }

  const sequenceKey = `funnel_${input.campaignId.replaceAll("-", "")}`.slice(0, 80);
  const sequenceResult = await queryPostgres<{ id: string }>(
    `
    insert into public.revenue_followup_sequences (
      tenant_id, brand_id, sequence_key, name, trigger_type, status,
      approval_required, stop_conditions_json, metadata_json
    )
    values (
      $1, nullif($2::text, '')::uuid, $3, $4, 'qualified_lead', 'active', true,
      '["reply_detected","appointment_booked","sale_detected","opt_out"]'::jsonb,
      $5::jsonb
    )
    on conflict (tenant_id, brand_id, sequence_key) do update set
      name = excluded.name,
      status = 'active',
      metadata_json = public.revenue_followup_sequences.metadata_json || excluded.metadata_json,
      updated_at = now()
    returning id
    `,
    [
      input.tenantId,
      input.brandId ?? "",
      sequenceKey,
      `${input.funnelName} qualified-lead follow-up`,
      JSON.stringify({ createdBy: "ad_autopilot_package", campaignId: input.campaignId })
    ]
  );
  const followupSequenceId = sequenceResult?.rows[0]?.id ?? null;

  if (followupSequenceId) {
    const steps = cleanLines(
      input.followUpPlan,
      [
        "Thank the prospect, confirm their request, and make the next step obvious.",
        "Follow up with one useful answer or proof point if they have not replied.",
        "Offer a simple way to book, reply, or say they are not ready."
      ],
      5
    );
    const delays = [0, 1440, 4320, 10080, 20160];
    for (const [index, message] of steps.entries()) {
      await queryPostgres(
        `
        insert into public.revenue_followup_steps (
          tenant_id, sequence_id, step_number, delay_minutes, channel,
          action_label, message_template, approval_required, metadata_json
        )
        values ($1, $2, $3, $4, 'email', $5, $6, true, $7::jsonb)
        on conflict (sequence_id, step_number) do update set
          delay_minutes = excluded.delay_minutes,
          action_label = excluded.action_label,
          message_template = excluded.message_template,
          metadata_json = public.revenue_followup_steps.metadata_json || excluded.metadata_json
        `,
        [
          input.tenantId,
          followupSequenceId,
          index + 1,
          delays[index] ?? (index + 1) * 10080,
          index === 0 ? "Respond to qualified request" : `Qualified lead follow-up ${index + 1}`,
          message,
          JSON.stringify({ createdBy: "ad_autopilot_package", campaignId: input.campaignId })
        ]
      );
    }
  }

  await queryPostgres(
    `
    update public.content_studio_campaigns
    set metadata_json = metadata_json || $3::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      input.tenantId,
      input.campaignId,
      JSON.stringify({
        operationalFunnelReady: Boolean(qualificationFormId && followupSequenceId),
        qualificationFormId,
        publicFormKey,
        publicFormPath: publicFormKey ? `/forms/${publicFormKey}` : null,
        followupSequenceId
      })
    ]
  );

  return { qualificationFormId, publicFormKey, followupSequenceId };
}
