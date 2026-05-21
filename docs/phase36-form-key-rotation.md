# Phase 36: Form Key Rotation

Phase 36 makes public form key rotation visible and operational.

## What changed

- Confirmed existing public form key rotation action.
- Shows last rotation date and actor on `/app/forms`.
- Keeps old/new key rotation history in `form_key_rotations`.
- Marks form key rotation complete in the roadmap.

## Product intent

External businesses need a way to rotate compromised or stale public form keys without recreating every form or breaking workspace/brand routing.

## Safety

- Rotation requires workspace management permission.
- The app does not email or publish the new key automatically.
- Public forms continue to resolve only through the current active key.
