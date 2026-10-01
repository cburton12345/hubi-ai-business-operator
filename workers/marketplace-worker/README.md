# Ferocity Marketplace Worker

This package is the deployment-independent worker for Ferocity's assisted Facebook Marketplace, Messenger, and Groups connector. The first runtime is a local Windows worker, but the orchestration, Ferocity API client, action journal, and browser adapter do not depend on Windows. A later hosted Windows or Oracle worker can run the same package with `runtime: hosted_worker` and an environment-managed connector secret; Ferocity's backend contract does not change.

It remains separate from H4R. It uses a Ferocity pairing code, Ferocity device credential, Ferocity workspace/identity, and Ferocity API routes. It does not reuse H4R production tokens or rows.

## How it behaves

- A lightweight Node supervisor starts after Windows login and stays running.
- The control loop checks Ferocity for approved queued actions without claiming or exposing their contents.
- Playwright/Chrome starts only when an approved action is ready or a scheduled inbound inbox sweep is due.
- The customer-owned Facebook profile is persistent on disk, so closing Chrome does not intentionally discard the session.
- The worker scans loaded Messenger threads, sends normalized inbound messages to Ferocity, and processes at most one approved outbound action at a time.
- When explicitly enabled, a capped six-hour community sweep reads only groups visible to the customer's signed-in account, records group/rules snapshots, and never treats missing rules as permission to post.
- Approved group posts use a separate group-composer path. Unknown or more-than-30-day-old rules prevent the backend from releasing the action.
- Discovery terms come from the connected business's services and locations, with a smaller adjacent business-community lane. Discovery never joins a group by itself.
- Approved join requests click Join once. Membership questions and rule acknowledgements are returned for owner attention rather than answered by automation.
- Group posts default to at least 72 hours apart per group and eight hours apart account-wide; exact content reuse is blocked for 90 days.
- Chrome closes after the configured idle timeout.
- The supervisor restarts the worker after a crash with bounded exponential backoff.
- The worker restarts Chrome after launch/runtime failures and reports health, login, checkpoint, restriction, and incompatible-page states to Ferocity.
- An on-disk action journal prevents a crash from blindly resending an action whose outcome is uncertain.

Facebook does not provide an inbound webhook to this assisted-browser connector. Therefore, a closed browser cannot wake instantly because a prospect sent a new Facebook message. Ferocity uses scheduled inbox sweeps for inbound discovery and immediate demand wake-up for outbound work. The default sweep is every five minutes; it is configurable from one minute to one hour.

## Security and safety

- Fresh pairing is observe-only; `sendEnabled` defaults to `false`.
- Group discovery is separately disabled by default. It requires `communityDiscoveryEnabled: true`; this does not enable posting.
- Sending requires both an action already approved by Ferocity's existing policy/approval flow and the local `sendEnabled` switch.
- The device credential is revocable, scoped, and expires after 30 days.
- On Windows, the configure command encrypts the credential with DPAPI for the current Windows user. It is not stored in `worker.config.json`.
- Hosted runtimes must provide `FEROCITY_CONNECTOR_TOKEN` using their platform secret manager.
- The worker does not collect Facebook passwords or bypass login, 2FA, CAPTCHA, checkpoints, restrictions, or platform safeguards.
- If a worker crashes during the uncertain moment of sending, it blocks automatic retry and reports the action for human reconciliation rather than risk a duplicate.
- Only one active sender should operate for the same Facebook identity at a time. Additional workers may remain observe-only.

## Local Windows setup

1. Install Node.js and Chrome.
2. In this folder, run `npm install`.
3. In Ferocity, open the Facebook distribution identity and create a one-time pairing code.
4. Run `Configure-Ferocity-Worker.cmd` and paste that pairing code.
5. Run `npm run dry-run` using the generated configuration, then `Start-Ferocity-Worker.cmd`.
6. When Chrome opens, the customer signs into the intended Facebook business account directly.
7. Leave sending disabled and verify one harmless inbound message reaches the correct Ferocity workspace exactly once.
8. Stop the worker, start it again, and confirm the persistent profile remains signed in.
9. Run `Install-Logon-Task.ps1` only after the manual test succeeds.
10. Enable `sendEnabled` only for a controlled, owner-approved single-message test.

The Windows scheduled task runs as the current interactive user because Facebook may legitimately require that user to see and complete a login or security check. It does not run as a hidden system account.

## Runtime settings

- `controlPollSeconds`: how often the lightweight process checks for approved work.
- `inboundSweepSeconds`: maximum normal delay before a closed browser wakes to look for inbound messages.
- `communitySweepSeconds`: interval for capped customer-visible Facebook group and rules checks; minimum one hour.
- `idleTimeoutSeconds`: how long Chrome stays open without observed or outbound work.
- `manualAttentionTimeoutSeconds`: how long a challenged/login browser stays visible for the customer before closing and trying on a later sweep.
- `maxThreadsPerSweep`: bound on thread navigation in one sweep.
- `maxCommunitiesPerSweep`: bound on group navigation in one sweep; default eight and maximum twenty.
- `communityDiscoveryEnabled`: opt-in group/rules discovery switch. It remains false for a fresh install.
- `headless`: defaults to false; headful mode is safer for legitimate customer login/checkpoint handling.

## Hosted deployment later

Use the same package and configure:

- `runtime: hosted_worker`
- a persistent disk for `.facebook-profile` and `logs/action-journal.json`
- `FEROCITY_CONNECTOR_TOKEN` in the host's secret manager
- a supervisor appropriate to the host (Windows Scheduled Task, systemd, or container restart policy)

The persistent action journal is required. Moving an identity between machines should be deliberate: pause the old worker, revoke its session, pair the new worker, complete Facebook verification, then certify observe-only before enabling sends.

## Release certification

- [ ] Source syntax and unit tests pass.
- [ ] Pairing is single-use and the credential is shown only to the worker.
- [ ] Windows auto-start brings the supervisor back after login.
- [ ] Killing Chrome causes a controlled relaunch on the next queued action or sweep.
- [ ] Killing the worker causes the supervisor to restart it.
- [ ] The browser remains closed between idle periods.
- [ ] Login/checkpoint/restriction states create a Ferocity alert and do not send.
- [ ] One inbound message creates one Ferocity conversation event.
- [ ] One approved outbound action sends once and receives one confirmation.
- [ ] Opt-in group discovery records only groups visible to the intended Facebook account.
- [ ] Captured rules show the right group, source, and timestamp; missing or stale rules block posting.
- [ ] An approved join request submits once, and membership questions stop for owner input.
- [ ] One approved group post publishes once and records browser evidence; an unapproved post is never claimable.
- [ ] A removed post, warning, checkpoint, or restriction pauses broader execution and alerts the workspace.
- [ ] A crash during send produces an uncertain-action block, not an automatic duplicate.
- [ ] Revoking the worker session stops all authenticated API calls.
