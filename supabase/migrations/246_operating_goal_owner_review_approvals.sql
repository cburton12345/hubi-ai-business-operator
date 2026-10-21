-- Make operating-goal owner reviews visible and actionable in the canonical approval queue.
alter table public.approvals drop constraint if exists approvals_target_type_check;
alter table public.approvals add constraint approvals_target_type_check
  check (target_type in (
    'ai_draft','recommendation','campaign_change','page_change','growth_action',
    'growth_opportunity','distribution_publication','distribution_destination',
    'local_presence_issue','local_presence_review_action','office_manager_action_request'
  ));

create unique index if not exists approvals_pending_target_idx
  on public.approvals(tenant_id,target_type,target_id)
  where status='pending';
