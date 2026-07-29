# Post-Deploy Service Onboarding Checklist

This captures the product direction discussed after the last deploy.

## Goal

Ferocity must simplify a business, not create another complicated system to learn.

The first experience should feel like ordering help:

1. Pick what Ferocity should help with first.
2. Ferocity explains what it can do now.
3. Ferocity shows what needs a connection, approval, or upgrade.
4. Everything else stays available but paused.

## Decisions

- Keep one platform.
- Keep AI guided mode and traditional/manual mode.
- Do not duplicate CRM, job, payment, marketing, or automation systems.
- Use existing setup verticals, service gates, plan tiers, and controls.
- Let customers start with only a few services.
- Always show that other services can be turned on under the current subscription or unlocked by upgrade.
- Keep the employee experience simple and separate-feeling, even if it uses the same backend.
- Every user should have their own login and only see what their role allows.

## Service States

Services should clearly communicate:

- Active: Ferocity is helping with this now.
- Available: included in the plan but not turned on.
- Upgrade: useful, but needs a higher tier.
- Needs connection: included or prepared, but needs an outside account or provider.
- Needs approval: ready to prepare or run, but human approval is required.

## Needed Work

- [x] Audit existing setup, feature readiness, service gates, and employee pages.
- [x] Confirm the existing vertical setup system can be reused.
- [x] Add a plain service-choice layer so users pick outcomes first.
- [x] Improve `/app/welcome` so it starts with services, not menus.
- [x] Improve `/app/setup` so it reads like a service menu plus direct controls.
- [x] Add a direct simple employee app route that does not show the full owner navigation.
- [x] Keep `/app/employee` available for admin/traditional navigation.
- [x] Verify no duplicate service system was created.
- [x] Run local checks.

## Notes

This pass should not deploy. It should prepare the local code so the next deploy has a cleaner first-use path.
