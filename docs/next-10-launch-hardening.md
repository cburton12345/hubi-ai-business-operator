# Ferocity Next 10 Launch Hardening

Status: local work in progress. Do not treat this file as deployed until Netlify deploy is intentionally run.

1. Provider connections should use normal sign-in pages first, not key-pasting for regular users.
2. Keep manual credential entry available for power users and edge cases.
3. Receipt photos should be capturable from the employee field view.
4. Receipt photos should be capturable from the owner/simple job tracker view.
5. Receipt uploads should use private storage when Supabase admin storage is configured.
6. Receipt extraction should create reviewable drafts, not trusted accounting entries.
7. Expense/payback records should link to jobs, workers, reimbursement status, and owner review.
8. External workforce intake should use the same receipt extraction path as the app.
9. Public/product pages should describe install, receipts, payments, integrations, and autopilot without implying unavailable live actions.
10. Local checks must pass before any deploy: typecheck, lint, build, and public guard when public language changes.

Notes:

- Reddit account/app creation may require the user to finish login or unblock provider security in a real browser session.
- AI receipt vision uses OpenAI only when an API key and readable image URL are available.
- PDF receipt storage is supported for review, but PDF OCR is not complete yet.
