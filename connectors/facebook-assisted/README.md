# Ferocity Facebook Assistant (dogfood build)

This Manifest V3 connector is deliberately review-first. It never stores Facebook credentials, never bypasses provider verification, never silently scrapes a feed, and never reports success merely because text was prepared.

## Local installation

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select this `connectors/facebook-assisted` directory.
3. In Ferocity Growth, create a 10-minute pairing code for a Facebook distribution identity.
4. Enter that code in the extension. The code is single-use; the resulting token is device-bound and expires after 12 hours.

## Controlled dogfood loop

1. On Facebook, select a relevant request or message and explicitly click **Capture selected Facebook text**.
2. Review the resulting opportunity in Ferocity, prepare a response, and approve it in the existing Approvals queue.
3. In the extension, click **Check for approved work**, then **Copy and open destination**.
4. Complete the action in Facebook and report the actual outcome.

Verification prompts, restrictions, unknown surfaces, expired sessions, and failed actions are sent to identity health and stop further claims. This build must be dogfooded on a controlled account before any wider rollout.
