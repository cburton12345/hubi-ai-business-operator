# Hosted Marketplace worker

This is the primary no-PC runtime for the Chris Burton recruiting identity. It runs the same reviewed Ferocity worker on a private, persistent Linux VM. The owner may use a phone or any trusted device for the one-time Facebook login or later checkpoint through the VM's private remote desktop. No Facebook password, cookie export, or browser profile transfer is required.

## Security boundary

- Use a dedicated VM and operating-system user only for the recruiting identity.
- Reach the VM desktop through Tailscale or the provider's authenticated private console. Do not expose RDP, VNC, Chrome DevTools, or noVNC to the public internet.
- Keep the Ferocity connector token in `/etc/ferocity-marketplace-worker/worker.env`, owned by root with mode `0600`, or in the host secret manager.
- Keep the browser profile, action journal, policy journal, and logs on the persistent disk at `/var/lib/ferocity-marketplace-worker`.
- Lock the worker to Facebook profile ID `61593739891634`. A missing or different `c_user` cookie blocks reads and writes.
- Start with `FEROCITY_FACEBOOK_SEND_ENABLED=false`. Observation and account-health certification must pass before enabling routine authorized writes.
- Never run the local/extension sender and hosted sender with writes enabled for the same Facebook identity at the same time.

## Host prerequisites

- Persistent Ubuntu LTS VM with a graphical session and encrypted provider storage.
- Node.js 24 LTS, npm, and Chrome/Chromium compatible with Playwright 1.63.0.
- Tailscale or an equivalent authenticated private overlay.
- A persistent disk that survives VM and service restarts.
- Automatic security updates and provider snapshots enabled.

The VM provider account and any paid plan remain an external provisioning decision. A free or existing host is acceptable only if it supplies persistent disk and a non-ephemeral graphical session.

## Installation

1. Create the service account and persistent directories:

   ```bash
   sudo useradd --system --create-home --home-dir /var/lib/ferocity-marketplace-worker --shell /usr/sbin/nologin ferocity-worker
   sudo install -d -o ferocity-worker -g ferocity-worker -m 0700 /var/lib/ferocity-marketplace-worker
   sudo install -d -o root -g root -m 0700 /etc/ferocity-marketplace-worker
   sudo install -d -o root -g root -m 0755 /opt/ferocity-marketplace-worker
   ```

2. Copy this package to `/opt/ferocity-marketplace-worker`, run `npm ci --omit=dev`, then `npx playwright install --with-deps chromium`.
3. Copy `deploy/worker.env.example` to `/etc/ferocity-marketplace-worker/worker.env`, insert the paired Ferocity device ID and connector token, configure the private display/Xauthority, and set root ownership with mode `0600`.
4. Install `deploy/ferocity-marketplace-worker.service`, reload systemd, and enable it. Do not start until the private desktop and display authority are confirmed.
5. Start with sending disabled. Through the private desktop, sign into the designated Chris Burton Facebook account and complete any legitimate checkpoint manually. The worker never receives the password.
6. Verify runtime `hosted_worker`, exact profile identity, healthy heartbeat, one inbound observation exactly once, and restart persistence.
7. Run kill-switch, interrupted-action, revocation, and controlled-write certification before enabling routine writes.

## Emergency stop

```bash
sudo -u ferocity-worker touch /var/lib/ferocity-marketplace-worker/PAUSE
```

New actions are not claimed, the browser closes, and queued Ferocity records remain preserved for review. An already irreversible provider action is never blindly retried. Remove the file and restart only after the cause is understood.

## Recovery

- A VM restart must restore the same persistent disk and service account.
- If the worker stopped during a send, the journal reports an uncertain result and prevents automatic retry.
- Moving to another VM requires pausing and revoking the old connector session, pairing a new device, signing in through the new private desktop, and repeating observe-only certification.
- Never copy the Facebook profile to an unrelated cloud service or place it in an unencrypted backup.

## Deployment gate

The hosted worker is release-ready only after automated tests, source checks, zero-vulnerability audit, private-network verification, identity lock, login persistence, inbound deduplication, kill switch, crash recovery, revocation, and one controlled authorized write pass. Account creation or paid VM activation must not incur a charge without explicit financial authorization.

