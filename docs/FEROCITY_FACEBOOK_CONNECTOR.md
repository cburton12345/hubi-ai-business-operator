# Ferocity Facebook Connector

## What is implemented

Ferocity has its own tenant-isolated Facebook/Messenger browser connector. The H4R connector was used only as a proven reference; Ferocity does not use H4R pairing codes, H4R device credentials, H4R endpoints, or H4R production records.

Two customer-owned transports implement the same Ferocity connector contract:

- the Chrome/Edge extension, which is simplest for a browser that is already open;
- the Marketplace worker, which runs a lightweight control process, starts a persistent Playwright/Chrome profile only for approved work or scheduled inbound sweeps, and closes Chrome after an idle timeout.

The worker core is deployment-independent. The initial package includes a Windows supervisor and login task; the same worker can later run on hosted Windows or Oracle infrastructure with persistent storage and a platform-managed secret without changing Ferocity's backend.

The connector supports:

- single-use, ten-minute pairing codes;
- hashed, revocable, device-bound credentials with a 30-day lifetime;
- one Ferocity workspace, brand, and Facebook identity per installation;
- observe-only startup and normalized inbound conversation capture;
- server-side deduplication and rejection of common Facebook interface text;
- identity health reports for verification, restriction, and incompatible surfaces;
- five-minute connector heartbeats with owner alerts for unhealthy states;
- one approved outbound action claim at a time;
- a two-minute local send lock and server-side action/idempotency gates;
- explicit confirmation of send success or failure;
- shared conversation history for inbound and outbound bodies, with browser-send evidence kept distinct from delivery/read evidence;
- Business Brain reply drafts prepared from the inbound conversation and held for review;
- workspace device listing and immediate revocation.
- read-only pending-work detection so an idle worker can wake without prematurely claiming an action;
- persistent action journaling and crash recovery that blocks uncertain retries instead of risking duplicate Facebook messages;
- automatic browser recycling, bounded reconnect backoff, Windows supervisor restart, and idle browser shutdown.
- separately opt-in, capped discovery of Facebook groups visible to the customer's legitimate signed-in account;
- group-rule snapshots with source and freshness tracking; missing or rules older than 30 days block group posting;
- approval-first Facebook group posts through a dedicated group composer, with browser execution evidence and uncertain-send protection.
- business-aware community discovery using configured services and locations plus a deliberately smaller adjacent-business-community lane;
- approval-first group join requests; Ferocity stops for owner input when a group asks membership questions or requires acknowledgements;
- anti-repetition cadence gates: 72 hours per group by default, eight hours account-wide, and no exact post reuse for 90 days.

## Customer installation

1. In Ferocity, open **Growth → Distribution identities** and select the Facebook identity.
2. Download the Ferocity Facebook Connector package.
3. Unzip it, open `chrome://extensions` or `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
4. In Ferocity, create a pairing code. In the connector options, enter the code and a recognizable device name.
5. Sign into Facebook directly. Ferocity never asks for the Facebook password, 2FA code, checkpoint response, or CAPTCHA.
6. Run an observe-only test and confirm that the event appears in the correct Ferocity workspace.
7. Enable **Execute replies already approved in Ferocity** only after the observe-only test passes.

## Operational boundaries

This is an assisted browser connector, not an official Meta API integration. The extension requires its browser to remain open. The worker can close its browser between scheduled sweeps, but its persistent profile must remain legitimately signed in; inbound messages cannot wake a fully closed Facebook browser instantly because this path has no Facebook webhook. Facebook UI changes can require selector maintenance. The connector must never attempt to bypass platform security, verification, restrictions, rate limits, or terms.

Fresh installations should remain approval-first. Full autonomous sending should not be enabled until the exact customer identity has passed live observation, deduplication, reply, health-pause, and revocation tests.

## Certification before release

Prepared package: `public/downloads/ferocity-facebook-connector-0.1.0.zip`
SHA-256: `3F652CA4CB3B02A6D917CC319F331A43D32C01C60DA20560804C4FCCDC036430`

Prepared Windows worker package: `public/downloads/ferocity-marketplace-worker-0.3.0.zip`
SHA-256: `DF8177AE68CF73ECC8FC94158C5702A2B19D7CEE36195DD45381749D5E62BF75`

- [ ] Downloaded ZIP hash matches the release record.
- [ ] A new install contains no credential or customer data.
- [ ] Pairing code works once and fails on reuse/expiry.
- [ ] An H4R pairing code cannot pair the Ferocity connector.
- [ ] The connector lands in the intended Ferocity workspace and identity.
- [ ] One inbound message creates one Ferocity message.
- [ ] Facebook navigation text does not create a message.
- [ ] An approved reply sends once and records one confirmation.
- [ ] A non-approved reply is never claimable.
- [ ] Checkpoint/restriction detection pauses execution and alerts Ferocity.
- [ ] Revoking the device immediately causes authenticated calls to fail.
- [ ] Two workspaces tested in parallel remain isolated.
- [ ] A queued action wakes an idle worker without claiming it before Chrome is ready.
- [ ] A scheduled inbound sweep starts Chrome and a quiet worker closes it after the idle timeout.
- [ ] Killing Chrome triggers bounded recovery; killing the worker triggers supervisor recovery.
- [ ] A crash during the send boundary blocks automatic retry and surfaces reconciliation instead of duplicating the message.
- [ ] Group discovery remains off by default and respects its configured group/navigation cap.
- [ ] A customer-visible group and its rules are captured with the correct source and timestamp.
- [ ] A suggested group can be sent to Approvals and joined once; groups with membership questions stop for owner input.
- [ ] Missing or stale rules prevent a group action from being claimed.
- [ ] An approved test-group post publishes exactly once; an unapproved post never reaches the worker.
- [ ] Post removal/moderator-warning observation and owner alerting are certified before broader group automation.

## H4R integration boundary

H4R can continue using its own production connector. If H4R is later connected to Ferocity, it should use a separate Ferocity pairing session and `destination=ferocity`; no production H4R token should be copied or shared.
