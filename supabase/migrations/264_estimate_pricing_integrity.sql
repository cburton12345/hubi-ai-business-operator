alter table public.service_estimates
  add column if not exists tax_rate_bps integer not null default 0
    check (tax_rate_bps between 0 and 100000);

comment on column public.service_estimates.tax_rate_bps is
  'Estimate tax rate in basis points. Tax is recalculated only from selected taxable line items after proportional discount.';
