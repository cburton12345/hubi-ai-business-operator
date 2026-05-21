# Phase 47 Supabase Auth Bridge

Phase 47 connects the existing workspace session model to Supabase Auth without removing the emergency admin-token path.

## What Changed

- Workspace sign-in now attempts Supabase Auth password login first when Supabase browser auth config is available.
- If Supabase Auth succeeds, the local `users.auth_user_id` field is linked for RLS-compatible identity mapping.
- Existing local password credentials remain as a fallback so current workspace accounts keep working.
- Workspace user creation and invite acceptance now create confirmed Supabase Auth users when service-role auth config is available.
- Invite acceptance still creates a Ferocity app session and selects the invited workspace.

## Guardrails

- Emergency admin-token access remains available.
- No social OAuth providers were enabled automatically.
- No external billing, email, SMS, calendar, ads, review, or publishing integrations were connected.
- Supabase Auth is additive; local sessions remain the app authorization boundary until full hosted-auth rollout.
