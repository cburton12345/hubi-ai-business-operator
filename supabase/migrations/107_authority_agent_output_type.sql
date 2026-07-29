alter table public.ai_agent_outputs
  drop constraint if exists ai_agent_outputs_output_type_check;

alter table public.ai_agent_outputs
  add constraint ai_agent_outputs_output_type_check
  check (
    output_type in (
      'internal_email',
      'draft_message',
      'follow_up_workflow',
      'review_workflow',
      'invoice_followup',
      'seo_draft',
      'action_queue',
      'timeline',
      'recommendation',
      'authority_check'
    )
  );
