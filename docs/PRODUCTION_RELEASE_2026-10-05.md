# Ferocity production release - October 5, 2026

## Release

- Production URL: `https://ferocity.live`
- Netlify deploy: `6ac4408619be4273b1e22af7`
- Deploy logs: `https://app.netlify.com/projects/ferocityflo/deploys/6ac4408619be4273b1e22af7`
- Owner authorization: explicit frontend deployment authorization received in the active Ferocity chat.

## Included

- Ask Ferocity and owner-workspace simplification completed locally on October 5.
- Document ingestion and review UX, printable expense/deposit packets, and direct original-document access.
- Document-scoped 60-second primary and independent-model extraction timeout.
- Independent financial-document review evidence and human-review enforcement.
- Correction for named incoming payment-provider deposits that were previously treated as transfers.

## Database and configuration

- Production `AI_MODEL_REVIEWER`: `gpt-6-astra`.
- Applied `235_independent_ai_reviews.sql`.
- Applied `236_named_incoming_payment_correction.sql`.
- Post-release migration validation: zero pending migrations.

## Certification

- Controlled two-page PDF: primary and independent reviewer each extracted all 12 known transactions exactly; comparison passed with zero disagreements.
- Controlled XLSX: primary and independent reviewer each extracted all 12 known transactions exactly; comparison passed with zero disagreements.
- Certification covered exact dates, cent amounts, debit/credit directions, repeated same-day purchases, named deposits, and true transfers.
- Certification fixtures created no document/review-queue records and were removed afterward.
- Full `npm run predeploy:local` passed with all guards, 203 Vitest files/764 tests, seven Marketplace worker tests, TypeScript, ESLint, migration validation, and the optimized production build.
- The existing `unpdf/pdfjs` dynamic-dependency warning remains non-fatal.

## Post-deploy smoke

- Homepage: HTTP 200.
- Production CSS asset: HTTP 200, 111,856 bytes.
- `/health`: HTTP 200.
- `/status`: HTTP 200.
- `/app/expenses`: HTTP 307 authentication redirect, expected for an unauthenticated request.
- Production reviewer setting read-back: `gpt-6-astra`.
- Pending migrations: zero.

No advertising campaign, publishing action, provider spend, billing purchase, or unrelated external commitment was performed.
