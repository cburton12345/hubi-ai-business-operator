# Trusted-device session candidate

Status: local release candidate only. Production and the production database are unchanged.

## Behavior

- Password and invitation sign-ins create a 90-day trusted-device session instead of a 14-day session.
- Active sessions renew only during the final 30 days and never beyond the one-year absolute identity-verification ceiling.
- The app refreshes session continuity at most once per 12 hours per browser profile, on app open, return to the foreground, or network reconnection.
- A failed background refresh never interrupts field work. Expired, revoked, or absolute-expired sessions fail closed on the server.
- Session refresh accepts same-origin requests only, keeps the cookie `HttpOnly`, `Secure` in production, and `SameSite=Lax`, and returns non-cacheable responses.
- Users can review active trusted devices, revoke a specific other device, or sign out every other device. All revocation writes are restricted to the authenticated user's own session rows.
- The emergency platform-recovery session remains short-lived and separate.

## Schema

Migration `293_trusted_device_sessions.sql` adds throttled activity, renewal, authentication-time, hard-expiry, device-label, and authentication-method fields. Existing active sessions receive the new 90-day window; revoked and expired sessions are not revived. The migration is additive and passed with migrations 282–293 in the retained disposable PostgreSQL validator inside a rollback transaction.

## Verification

- PGlite migration execution proves active-session extension, revoked-session preservation, and authentication-method/device-label constraints.
- Same-origin renewal, live/revoked/expiry predicates, hard-ceiling behavior, user-scoped revocation, current-device preservation, and failed-initial-session persistence have focused contract coverage.
- Full suite: 368 files / 1,549 tests.
- Hosted MarketplacePro worker: 15 tests.
- TypeScript, full lint, public/provider/capability/UI/architecture guards, explicit Data API grant validation, 130-page production build, and 149 document-runtime traces pass.
- Production dependency audit: zero vulnerabilities.

## Release boundary

Do not deploy this feature independently. Apply migration 293 immediately before the next deliberately authorized Ferocity production publish, then verify an existing active session, a new password session, refresh behavior, device listing/revocation, field time-clock access, logout, and the protected-route crawl. No production mutation or deployment occurred while preparing this candidate.
