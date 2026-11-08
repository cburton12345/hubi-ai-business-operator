# MarketplacePro owner-pilot optional patch manifest

Status: local optional increment, disabled and not accepted into a core launch candidate. No migration, credential, provider, production, or deployment action occurred.

Baseline commit: `ad275fe0ceb0c31ed713c12c7720a3cc9248ad96` (`Harden credential rotation and financial review gates`). Hashes are Git blob object IDs over exact file bytes. `absent` means the file does not exist at the baseline commit. This manifest intentionally does not hash itself.

| Owned file | Baseline blob | Current blob |
| --- | --- | --- |
| `src/app/api/integrations/marketplacepro/events/route.ts` | `e84913f18b5ee72432faad8f1cf2fbb19e06af6a` | `60fa49940387a6fcc69402604406a2f77e147ef0` |
| `src/app/api/integrations/marketplacepro/leads/route.ts` | `6ebb25de7927fc15a0a91cbee9a94250b2819b3c` | `a6af95932ae1ec3c336e0aad7e1204562b11fed3` |
| `src/app/api/integrations/marketplacepro/settings/route.ts` | `d2c288c09201b688fc67708339cfd95edc2097c6` | `3d78b8c882e5796cf703aef9d57cee0aa745d440` |
| `src/app/api/integrations/marketplacepro/status/route.ts` | `51b8a7c8ff17c744cd8c3670f24b176afa016909` | `041a57a78bea888dbf2a008736458a8312dde5ac` |
| `src/app/api/integrations/marketplacepro/v1/events/route.ts` | `absent` | `dc1f413a7b37aba6f79a5d95c7bc066a3b4e8c0c` |
| `src/app/api/integrations/marketplacepro/v1/leads/route.ts` | `absent` | `378215f598d4beaf3179c5ad468b1188fcaf990a` |
| `src/app/api/integrations/marketplacepro/v1/status/route.ts` | `absent` | `96b7a9147f4b01e90d26688dd0727aa39ce34176` |
| `src/lib/integrations/capability-truth.ts` | `576871df38bc997c4ad119517c40d355d69a870c` | `9a6c7bf0478f01d26d6f2e80fe1c6f976788e418` |
| `src/lib/integrations/get-integrations.ts` | `5271cc8e1073ed1af6a87c66c13c0d6ccf06bb20` | `9ba56c802d83a15e82fb62bddd4fbcc55962f983` |
| `src/lib/integrations/marketplacepro.ts` | `b5270201f1fdf5e3f3d3cb4c685d57995a057f68` | `38ae9c37599a9296637d95339f21786a0a66b2dd` |
| `src/lib/integrations/marketplacepro-delivery.ts` | `absent` | `85740d47bdd94449d501ab9c0497f419d35c7b0e` |
| `src/lib/integrations/marketplacepro-delivery-runtime.ts` | `absent` | `340e4e61c29a25078798aca4930dc33a030e1c79` |
| `src/lib/integrations/marketplacepro-delivery-store.ts` | `absent` | `b1071c3fbdd2163f60e0056c22276017f1ed199d` |
| `src/lib/integrations/marketplacepro-http.ts` | `absent` | `3a46e643e22cd5c88e566862623a7295c4587ad6` |
| `src/lib/integrations/marketplacepro-legacy-runtime.ts` | `absent` | `f69418f5c88c29e9bc8bb5f8701d05fb6e52b76f` |
| `src/lib/integrations/marketplacepro-delivery.test.ts` | `absent` | `7ac938bc26b77bd916e558a506a2618be2abaf8a` |
| `src/lib/integrations/marketplacepro-delivery.pglite.test.mjs` | `absent` | `5c087d22ac2499b4b6ddd5c758e9d313924e4e95` |
| `src/lib/integrations/provider-capability-truth.json` | `cdc5d52138f85dc0da65c4d0472a9a8457710af2` | `1d39b3e13d5f1d2ec298936523221fa84ffbc437` |
| `supabase/migrations/269_marketplacepro_delivery_inbox.sql` | `absent` | `321e2daa579085f11a8bc19c17e092211f8d0b97` |
| `supabase/marketplacepro_delivery_inbox_fixture.sql` | `absent` | `e1f8df639de864d6d7801d485cac6b0c07225b63` |
| `scripts/test-marketplacepro-delivery-inbox-local.ts` | `absent` | `4a1465e8e2d21e2db664c98616476c7b2c5bc063` |
| `docs/MARKETPLACEPRO_OWNER_PILOT_DELIVERY_V1.md` | `absent` | `2c64a3008ab8d2eeb11130c542a40bed84f4b549` |

## Verification state

- In-memory v1/legacy receiver regression tests and the synthetic PGlite migration/RLS tests pass.
- Repository-wide TypeScript without incremental cache, targeted lint, provider truth, and explicit Data API grant guards pass.
- The real two-session PostgreSQL concurrency/retry fixture is prepared but has not run because `FEROCITY_LOCAL_TEST_DATABASE_URL` is not available to this task.

## Blocking prerequisites

- Trusted owner-only enrollment provisioning is not implemented; do not expose a public enrollment endpoint.
- Migration 269 must pass its cross-tenant brand preflight and normal review before application.
- A separate eligible `owner_platform_connections` row is required before the existing goal-observation scanner can consume the durable owner event; this is not proven provisioned.
- MarketplacePro sender wiring and non-production end-to-end certification remain required.
- Legacy `needs_attention` behavior is unknown and remains blocked by the stricter `connected` plus `ready` gate.
