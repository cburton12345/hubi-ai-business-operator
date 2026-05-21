# Phase 38: Legal Lead Qualification

Phase 38 adds a manual qualification workflow for legal-sensitive case intake leads.

## What changed

- Legal intake details now show on lead detail pages.
- Added a legal qualification action for `case_intake` leads.
- Qualification considers disclaimer acknowledgement, attorney status, treatment status, incident date, and contact signals.
- Legal lead scoring now includes legal-specific reasons.
- Lead events record the qualification result.

## Product intent

Ferocity-style legal lead generation needs stricter review before routing or monetization. This phase helps operators classify legal leads while preserving the no-legal-advice and no-guarantee guardrails.

## Safety

- No legal advice is generated.
- No compensation estimate is generated.
- No external routing occurs automatically.
- Manual approval remains required before any routing or buyer handoff.
