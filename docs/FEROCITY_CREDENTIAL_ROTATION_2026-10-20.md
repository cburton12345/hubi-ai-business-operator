# Ferocity credential-rotation runbook

Status: local implementation complete; production rotation and release not performed.

## Incident boundary

A private Netlify CLI tool response exposed unmasked production environment values. The values must not be copied into documentation, source, commits, tickets, or chat. Treat the following credential classes as compromised until rotated:

- Ferocity admin access token
- AI workforce cron token
- credential-vault encryption key
- database URL/password
- email provider API key
- MarketplacePro webhook secret
- OpenAI API key
- owner command-center token
- Resend inbound webhook secret
- Supabase service-role credential
- VAPID private key
- workforce intake token

The incident does not prove public disclosure or misuse. Rotation is still required because the values appeared outside their intended secret store.

## Non-negotiable safety rules

1. Never print or retrieve the complete production environment as JSON.
2. Inspect only variable names or provider status. Do not echo values.
3. Do not replace a credential until every caller and receiver is identified.
4. Use an overlap window wherever the provider or Ferocity supports two active credentials.
5. Deploy dual-secret verification before changing an internal inbound credential.
6. Verify the new credential on a harmless request before revoking the old one.
7. Record actor, time, credential class, affected dependency, verification result, and revocation result without recording the secret.
8. Stop and restore the previous primary credential if the new credential cannot be verified. Do not revoke the last working credential.

## Implemented overlap support

The local release candidate accepts a current and previous secret for these inbound boundaries while issuing new sessions and outbound calls with the current value only:

| Primary variable | Temporary overlap variable | Boundary |
| --- | --- | --- |
| `ADMIN_ACCESS_TOKEN` | `ADMIN_ACCESS_TOKEN_PREVIOUS` | admin bearer/session authentication |
| `AI_WORKFORCE_CRON_TOKEN` | `AI_WORKFORCE_CRON_TOKEN_PREVIOUS` | AI monitor, business automation, reminders |
| `OWNER_COMMAND_CENTER_TOKEN` | `OWNER_COMMAND_CENTER_TOKEN_PREVIOUS` | owner event intake and authorized workforce fallback |
| `WORKFORCE_INTAKE_TOKEN` | `WORKFORCE_INTAKE_TOKEN_PREVIOUS` | field media and location intake |
| `MARKETPLACEPRO_WEBHOOK_SECRET` | `MARKETPLACEPRO_WEBHOOK_SECRET_PREVIOUS` | MarketplacePro signed/shared-secret callbacks |
| `RESEND_INBOUND_WEBHOOK_SECRET` | `RESEND_INBOUND_WEBHOOK_SECRET_PREVIOUS` | Resend/Svix/HMAC/bearer inbound verification |

Matching is constant-time over SHA-256 digests and rejects missing or blank candidates. Previous values are temporary rollback compatibility, not permanent configuration.

## Release and rotation order

### Phase 1 — release overlap support

1. Complete the mandatory local release gate on the exact tree.
2. Add each existing primary value as both primary and temporary previous only where an overlap variable is needed. Do not expose the value while doing so.
3. Deploy only after the owner's exact deployment authorization.
4. Verify existing cron, admin, owner-command, workforce, MarketplacePro, and Resend paths still authenticate.

### Phase 2 — rotate internal shared secrets

For each internal token, one at a time:

1. Generate a cryptographically random 256-bit value directly into the provider secret store or secure local password manager; do not print it.
2. Set the old primary as `*_PREVIOUS` and the new value as the primary.
3. Update all known callers to send the new primary.
4. Deploy the configuration change and run a harmless authenticated request plus an invalid-token rejection check.
5. Observe one normal scheduled/event cycle where applicable.
6. Remove the previous value in a later deploy after all callers are proven migrated.

### Phase 3 — rotate provider API credentials

- **OpenAI:** create a new project-scoped key with the minimum required project permissions, install it in the secret store, deploy, run one bounded non-customer readiness request, then revoke the exposed key after usage and error monitoring remain normal.
- **Resend API:** create a replacement sending key scoped to the Ferocity domain where supported. This is separate from the inbound webhook secret. Verify a provider-side/domain readiness check without sending customer communication, then revoke the exposed key.
- **MarketplacePro:** coordinate the shared webhook secret with the authoritative MarketplacePro deployment. Ferocity's overlap verifier must be live first. Change the sender, prove one signed harmless callback, then retire the old value.
- **Supabase service role:** rotate through the Supabase project's supported signing-key/service-role procedure. Confirm both the Next runtime and standalone worker use the replacement. Run RLS/postflight checks before retiring the old credential.
- **Database password/URL:** identify every direct PostgreSQL consumer, pooler mode, CI job, migration runner, worker, and local protected environment. Rotate as one coordinated maintenance action, update every consumer, verify connections and postflights, and invalidate the prior password only after all consumers pass.

### Phase 4 — rotate the credential-vault encryption key

This is a data re-encryption operation, not a normal environment-variable replacement.

1. Deploy dual-read/current-write key support with the old key retained only as the previous decryption key.
2. Run the vault rotation script in dry-run mode and reconcile the exact row count and every failure.
3. Run the confirmed rotation only with `CONFIRM_CREDENTIAL_VAULT_ROTATION=YES` in a controlled session.
4. Verify every encrypted credential decrypts with the new primary and no row still requires the old key.
5. Remove the previous key in a later release.

Never discard the old encryption key before the persisted credentials have been re-encrypted and verified.

### Phase 5 — rotate VAPID carefully

Changing the VAPID private key can invalidate existing browser push subscriptions. Inventory active subscriptions and provide a user re-enrollment path before rotation. Rotate the public/private pair together, deploy, verify new subscription and delivery on test identities, then retire incompatible subscriptions. Do not silently treat broken delivery as success.

## Required evidence before closing the incident

- The exact-tree release gate passed after overlap support was added.
- Every compromised credential class has a recorded rotation or a documented owner/provider blocker.
- Old values are revoked or removed after the overlap window.
- Invalid old credentials fail after retirement.
- Scheduled jobs, provider callbacks, email intake, admin access, database access, encrypted credential reads, push enrollment, and AI readiness each have bounded verification evidence.
- Netlify/Supabase/provider audit logs show no unexplained use during the exposure window, to the extent each provider makes such logs available.
- No credential value appears in Git history, build output, documentation, or user-visible output.

## Current blocker

Actual credential replacement is intentionally deferred until the local dual-secret code is released. Rotating the production primaries before that release could break the currently published application, and a frontend deployment still requires the owner's exact authorization phrase.
