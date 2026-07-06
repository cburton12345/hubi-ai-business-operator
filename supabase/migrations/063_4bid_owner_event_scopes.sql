update public.owner_platform_connections
set event_scope = array[
    'payment.issue',
    'payment.received',
    'payment.refund_recorded',
    'seller.payout_updated',
    'pickup.issue',
    'auction.ending_soon',
    'support.contact',
    'support.platform_issue'
  ],
  notes = '4Bid auction platform owner events for payments, refunds, seller payouts, pickup issues, auction deadlines, and support escalation.',
  metadata_json = metadata_json || '{"eventContract":"4bid_owner_events_v1"}'::jsonb,
  updated_at = now()
where platform_key = '4bid';
