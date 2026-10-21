-- Owners need an explicit reversible pause state. Paused goals are excluded
-- from the due-goal indexes and scheduled automation until deliberately resumed.

alter table public.operating_goals
  drop constraint if exists operating_goals_status_check;

alter table public.operating_goals
  add constraint operating_goals_status_check
  check (status in (
    'draft','active','progressing','waiting','blocked','needs_owner','paused',
    'completed','verified','canceled'
  ));

comment on column public.operating_goals.status is
  'Lifecycle state. paused is owner-controlled and never evaluated or resumed automatically.';
