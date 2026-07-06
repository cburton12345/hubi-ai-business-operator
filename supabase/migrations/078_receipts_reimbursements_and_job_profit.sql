alter table public.operations_expenses
  add column if not exists reimbursement_status text not null default 'not_reimbursable'
    check (reimbursement_status in ('not_reimbursable', 'submitted', 'approved', 'paid', 'rejected')),
  add column if not exists reimbursement_due_date date,
  add column if not exists paid_back_cents integer not null default 0,
  add column if not exists paid_back_at timestamptz,
  add column if not exists reimbursement_notes text;

create index if not exists idx_operations_expenses_reimbursement
  on public.operations_expenses(tenant_id, reimbursement_status, reimbursement_due_date, created_at desc);

do $$
begin
  if to_regclass('public.feature_entitlements') is not null then
    insert into public.feature_entitlements (feature_key, feature_name, description, tier, status, metadata_json)
    values
      (
        'receipt_reimbursement_tracker',
        'Receipt reimbursement tracker',
        'Let workers submit receipts, remind owners what needs reimbursed, and connect expenses to job profit and loss.',
        'operations',
        'enabled',
        '{"ownerVisible": true, "employeeVisible": true, "feedsJobProfit": true}'::jsonb
      ),
      (
        'accounts_receivable_tracker',
        'Accounts receivable tracker',
        'Show money customers still owe, overdue invoices, and collection reminders beside job profit.',
        'finance',
        'enabled',
        '{"ownerVisible": true, "feedsCashCollection": true}'::jsonb
      )
    on conflict (feature_key) do update set
      feature_name = excluded.feature_name,
      description = excluded.description,
      tier = excluded.tier,
      status = excluded.status,
      metadata_json = public.feature_entitlements.metadata_json || excluded.metadata_json;
  end if;
end $$;
