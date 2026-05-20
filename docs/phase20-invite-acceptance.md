# Phase 20 Invite Acceptance

Phase 20 improves SaaS readiness by adding invite links for external customer workspace access.

## Delivered

- Workspace invite records now support hashed invite tokens and unique invite links.
- Access Control can generate a pending invite link for owner, admin, operator, or viewer roles.
- Invite links are not emailed automatically; operators copy and send them manually until an email provider is intentionally connected.
- `/invite/[token]` lets invited users create a password, accept the invite, join the organization, and land in onboarding.
- Accepted invites create a normal app session and mark the invite accepted.

## Safety

- Invite tokens are stored as hashes, not raw tokens.
- Invites expire after 14 days.
- No email or SMS provider is connected.
- Existing manual user creation remains available for controlled admin setup.
