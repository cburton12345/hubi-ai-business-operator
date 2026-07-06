# Phase 43 Workspace Data Exports

Phase 43 adds a clean workspace data export path for external businesses that need account portability, offboarding support, or audit snapshots.

## What Changed

- Added a `workspace_data_exports` table with workspace-scoped RLS for owner/admin access.
- Added a manual export action that creates a ready JSON package from core workspace data.
- Added export package list, detail, and download views under `/app/exports`.
- Included brand, lead, AI queue, draft, recommendation, approval, content export, customer, estimate, job, and invoice data in the first export package version.
- Clarified the product path as `Backups & Exports`, with future Google Sheets/Drive sync as an optional customer-controlled copy.

## Guardrails

- Export packages are created manually by workspace admins or owners.
- No external file storage, Google Sheets sync, email delivery, publishing integration, or billing integration was connected.
- Packages stay inside the workspace database and can be expanded later into downloadable files or secure object storage.
- Google Sheets should not be treated as the only backup. It is a readable export destination; database backups, RLS, audit logs, and least-privilege credentials remain the real recovery layer.
