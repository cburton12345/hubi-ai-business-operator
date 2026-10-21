# Ferocity Customer Onboarding Audit — October 14, 2026

Status: source implementation complete and release-gated; migrations 250–252 pending; not deployed.

## What already worked

- Paid checkout can provision a customer workspace, entitlements, default agent workflows, owner invite, and activation email.
- Public guided setup can preserve the pre-signup Ferocity conversation in the new workspace.
- Provider OAuth uses state-bound, tenant-scoped jobs and encrypted token storage. Standard providers perform identity/account discovery where supported.
- Provider writes, sending, publishing, advertising spend, and money movement remain separately gated.
- Ask Ferocity, persistent operating goals, automation, connection health, action receipts, and result links already existed and were extended rather than replaced.

## Defects found and repaired

- The conversational guide collected the business industry only in browser state. The first onboarding command now persists that owner-provided industry and desired first outcome into the existing Business Brain before execution.
- The first completed chat turn removed `onboarding=1` from the URL and left setup progress stale. Onboarding mode now survives thread creation, and the server-rendered evidence state refreshes after every result.
- Setup displayed the total number of checks as “remaining.” It now counts only incomplete checks.
- Provisioned approval defaults were mistaken for owner-confirmed authority. Completion now requires a durable owner-originated preset/control event; conservative defaults alone never count as consent.
- Authority setup now gives three plain-language starting choices—handle routine work, prepare then ask, or recommend only—and returns directly to the guided conversation after recording the choice.
- Contextual connection links passed a `focus` parameter that the integrations page ignored, exposing the full provider catalog. Guided setup now shows only the relevant inbox, phone, or service-platform choices and explains the effective read-first boundary.
- External OAuth is no longer mandatory. A customer may deliberately continue with a real Ferocity-native customer, job, task, or document; real operating evidence can satisfy the business-source requirement without granting an outside account.
- Paid-workspace reuse now excludes internal/platform workspaces and considers only customer workspaces or customer invitations, preventing a matching email from upgrading the wrong tenant type.
- Welcome and integration setup CTAs now return to the same conversational onboarding flow instead of splitting users across legacy guided-setup and AI-workforce surfaces.
- The UI release guard was aligned with the extracted route-aware `WorkspaceNavMenu`, preserving its duplicate/destination limits without reverting the shared menu repair.

- A non-platform workspace user could reach the global workspace-creation surface and its unscoped tenant list. Page, read helper, and action now require `platform:manage`.
- The internal workspace-creation form marked onboarding complete immediately. It now starts `in_progress` and uses the same evidence-backed completion rules as customer signup.
- Any onboarding-mode chat command previously marked onboarding complete before connections, discovery, or a result existed. That write was removed.
- Customer provisioning did not create a durable onboarding outcome. Both paid and starter provisioning now create/sync the idempotent `customer-onboarding:v1` operating goal.
- `/start` previously saved ordinary self-service paid selections as access requests and stopped. It now preserves that intake record, creates a single-use 30-minute hashed handoff, prefills `/subscribe`, and continues into Stripe checkout. Checkout securely reuses the same intake record instead of duplicating it. Earn keeps its automatic supported path; managed/agency plans remain review-based.
- Setup progress was three generic checks. It now reflects business context, authority, a contextually relevant connection, actual discovery evidence, and a verified first useful result.
- A chat message counted as first value. It no longer does. First value requires a verified completed action receipt or a real operating/document record.
- Calendar OAuth requested write-capable scopes during initial setup. Initial Google and Microsoft calendar connection is now read-only.
- OAuth technical scopes were not separated from customer authority. Migration 251 adds tenant-scoped, plain-language authority receipts. OAuth grants read/monitor/draft and explicitly denies write, communication, publishing, spend, and money movement until a later explicit decision.
- Standard OAuth now preserves a safe in-app return destination, records authority, synchronizes onboarding, and resumes the guided flow. Meta, TikTok Business, and X custom callbacks receive the same authority/onboarding synchronization.
- The integrations page now shows the effective logical authority and explains that provider login scopes do not authorize consequential actions.
- Scheduled automation now keeps the onboarding goal moving and re-evaluates it from evidence.
- Connected inboxes now run an immediate, failure-isolated read-only discovery pass after OAuth. Imported mailbox messages count as real discovery evidence; an OAuth handshake by itself still does not.
- Connected calendars now discover the available calendar list after OAuth. During onboarding, the customer selects the operating calendar and Ferocity immediately runs the first inbound-only sync before returning to the conversation.
- Onboarding connection buttons preserve a safe, internal return path and return the customer to Ask Ferocity with a provider-specific discovery/result command prepared instead of abandoning them on a generic connection page.
- Source-level role certification confirms that only workspace owners/admins can connect providers or configure calendar/mailbox discovery; operators/viewers cannot. Internal workspace provisioning remains platform-admin only.
- External AI remains an optional preference, never a required onboarding dependency. Ferocity's native AI is the default. Welcome and integration surfaces disclose that compatible paid assistants may be connected later through narrow, revocable access without exposing Ferocity's private implementation.

## Contextual connection behavior

Ferocity always proposes a read-only customer inbox as the safest initial discovery source, then adds only relevant capabilities inferred from the business and desired outcome: calendar, CRM/service platform, phone/text, advertising, or payments. It does not present every provider as a required checklist.

An outside AI assistant is not included in that required checklist. Owners/admins can deliberately enable one after reviewing scopes and acknowledging the external provider&apos;s processing terms.

## Completion contract

Onboarding is complete only when all five conditions are true:

1. Useful business context exists.
2. Authority preferences exist.
3. At least one relevant business source exists: a connected system or a real Ferocity-native operating/document record.
4. That source has contributed to a verified result or imported operating record; OAuth success alone is not discovery.
5. A verified first useful result exists.

## Remaining validation before deployment

- Reconfirm the configured canonical production Supabase project `puvpgebitzvyqbdnnlyz`, then review and deliberately apply pending migrations 250–252 as one production change. None was applied during this work.
- Run an authenticated browser certification with one new test customer through Stripe test checkout, signup/invite, business conversation, Gmail or Microsoft OAuth, discovery, first-value execution, disconnect/reconnect, and permission display. The public `/start` experience was inspected in the local browser; submitting it was intentionally avoided because the configured database is remote and the form sends real setup email/activity.
- Confirm production provider callback URLs are unchanged and the read-only calendar scope change is accepted by both provider consoles.
- Add the explicit production `MCP_ALLOWED_HOSTS=api.ferocity.live,ferocity.live` key before releasing the MCP route. The local key-presence gate passes with that exact value, but production has not been mutated.
- The Netlify app connector currently requires reauthentication. The linked CLI confirmed the correct production site, but preview/promotion and immutable deploy evidence remain intentionally unperformed.
- The complete current local predeploy gate passes: 44-provider truth guard, 22 high-risk capability contracts, 311-route UI guard, 43 workflow assertions, all three pending migrations validated transactionally without persistence, 258 test files / 1,024 tests, seven marketplace-worker tests, repository TypeScript, repository lint, the optimized 123-page production build, and the PDF runtime artifact trace. Deployment still requires the owner's exact authorization phrase.
