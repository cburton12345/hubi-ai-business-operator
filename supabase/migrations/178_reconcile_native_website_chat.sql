update public.office_manager_channel_configs
set status = 'ready',
    inbound_enabled = true,
    outbound_enabled = true,
    setup_notes = 'Ferocity website chat is available through an active public form. Install and test it on each website before calling that site connected.',
    metadata_json = metadata_json || '{"nativePublicChat":true,"installationRequiredPerWebsite":true}'::jsonb,
    updated_at = now()
where channel_key = 'website_chat' and provider_key = 'ferocity_web_chat';
