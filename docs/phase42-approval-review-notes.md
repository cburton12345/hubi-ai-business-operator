# Phase 42 Approval Review Notes

Phase 42 adds structured reviewer notes to the approval queue so approved, rejected, and changes-requested decisions carry clear context for external workspace teams.

## What Changed

- Pending approvals now include an optional review notes field before approval, rejection, or changes-requested decisions.
- Approval decisions persist reviewer notes on the approval record when notes are provided.
- Approval activity logs now include the reviewer note in metadata for audit follow-up.
- Draft and recommendation status transitions remain unchanged and still require manual review before publishing.

## Guardrails

- Notes are internal review context only.
- No public content is published automatically.
- No external platform, ad budget, message, billing, or review response integration was connected.
