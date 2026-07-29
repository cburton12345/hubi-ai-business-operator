alter table public.service_invoice_payment_links
  drop constraint if exists service_invoice_payment_links_payment_mode_check;

alter table public.service_invoice_payment_links
  add constraint service_invoice_payment_links_payment_mode_check
  check (payment_mode in ('manual_tracking', 'platform_direct', 'stripe_connect_direct', 'stripe_connect_destination'));

alter table public.service_invoice_payments
  drop constraint if exists service_invoice_payments_payment_mode_check;

alter table public.service_invoice_payments
  add constraint service_invoice_payments_payment_mode_check
  check (payment_mode in ('manual_tracking', 'platform_direct', 'stripe_connect_direct', 'stripe_connect_destination'));

comment on column public.service_invoice_payment_links.payment_mode is
  'stripe_connect_direct is the supported SaaS flow. stripe_connect_destination remains only for historical records.';
