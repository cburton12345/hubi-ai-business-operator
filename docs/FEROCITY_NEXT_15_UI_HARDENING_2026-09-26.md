# Ferocity next 15 — chat-first UI hardening

Status: implemented and verified locally; not deployed.

1. Filter platform-only safety and reliability alerts from the customer Today view.
2. Filter platform-only items from the customer chat attention badge.
3. Filter platform-only items from the customer opportunity details.
4. Filter platform-only events from the customer activity feed.
5. Make Ask Ferocity the clear primary workspace destination.
6. Remove the repeated command strip from ordinary customer subpages.
7. Show only unfinished setup steps after onboarding.
8. Limit the expanded priority list to the four strongest customer-facing items.
9. Make attention expansion state accessible to assistive technology.
10. Return keyboard focus to the chat composer after Ferocity responds and keep the newest work in view.
11. Add clear Enter/Shift+Enter guidance and accessible busy state to the composer.
12. Add 25-file batch feedback plus a visible way to clear selected documents.
13. Correct the missing screen-reader-only utility that exposed hidden labels and the native file input.
14. Improve narrow-screen composer layout and iPhone/Android safe-area spacing.
15. Correct Today metric-card layout, wording, counts, and accessible labels.

Additional cleanup completed in the same pass:

- Replaced generic “AI operations department” language with “Your business, coordinated.”
- Added a keyboard skip link and active-state support inside the More menu.
- Removed the signed-in email from the ordinary customer header while preserving the workspace and access level.
- Removed defensive/internal wording from the public homepage CTA; proprietary safeguards remain enforced in the public chat instructions.
- Removed the development-only multipart form warning without weakening document upload behavior.

Verification:

- TypeScript passed.
- Targeted ESLint passed.
- 12 focused chat, conversation-understanding, and public catalog tests passed.
- UI guard passed across 297 routes and 243 component files.
- Public company/name leak guard passed.
- Local authenticated browser review passed for Ask Ferocity and Today.
- No production deployment was performed in this pass.
