alter table public.leads
  drop constraint if exists leads_lead_type_check;

alter table public.leads
  add constraint leads_lead_type_check
  check (
    lead_type in (
      'general',
      'appointment',
      'quote',
      'demo',
      'buyer',
      'seller',
      'bidder',
      'consignor',
      'rental_request',
      'case_intake'
    )
  );
