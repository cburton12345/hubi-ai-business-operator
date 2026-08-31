update public.billing_plans
set metadata_json=(metadata_json - 'checkoutMode') || '{"checkoutMode":"stripe","stripePriceCertified":true}'::jsonb
where plan_key='ferocity_connect';

update public.usage_bundles
set metadata_json=metadata_json || '{"stripePriceCertified":true,"purchaseFlow":"admin_assisted_until_add_on_checkout_is_certified"}'::jsonb,
    updated_at=now()
where bundle_key='ferocity_connect_additional_device';
