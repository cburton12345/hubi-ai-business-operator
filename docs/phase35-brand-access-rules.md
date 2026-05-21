# Phase 35: Brand Access Rules

Phase 35 adds the foundation for brand-specific access inside a workspace.

## What changed

- Added `brand_user_access` with workspace-scoped RLS.
- Added brand access management to `/app/access`.
- Workspace owners/admins can grant brand-level roles to active workspace users.
- Brand access changes are audit logged.
- Added a helper for checking a user's brand access role later as filtering/enforcement deepens.

## Product intent

External businesses may have multiple brands, divisions, service lines, or locations. This creates the structure needed to limit teammates or clients to specific brand contexts without changing the workspace model.

## Safety

- Workspace owners/admins retain control.
- This phase prepares brand scoping and displays rules; broader route-level enforcement can be added incrementally where brand-specific data views need it.
