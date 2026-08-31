# Ferocity Facebook Connector

## What is implemented

Ferocity has its own tenant-isolated Facebook/Messenger browser connector. The H4R connector was used only as a proven reference; Ferocity does not use H4R pairing codes, H4R device credentials, H4R endpoints, or H4R production records.

The connector supports:

- single-use, ten-minute pairing codes;
- hashed, revocable, device-bound credentials with a 30-day lifetime;
- one Ferocity workspace, brand, and Facebook identity per installation;
- observe-only startup and normalized inbound conversation capture;
- server-side deduplication and rejection of common Facebook interface text;
- identity health reports for verification, restriction, and incompatible surfaces;
- one approved outbound action claim at a time;
- a two-minute local send lock and server-side action/idempotency gates;
- explicit confirmation of send success or failure;
- workspace device listing and immediate revocation.

## Customer installation

1. In Ferocity, open **Growth → Distribution identities** and select the Facebook identity.
2. Download the Ferocity Facebook Connector package.
3. Unzip it, open `chrome://extensions` or `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
4. In Ferocity, create a pairing code. In the connector options, enter the code and a recognizable device name.
5. Sign into Facebook directly. Ferocity never asks for the Facebook password, 2FA code, checkpoint response, or CAPTCHA.
6. Run an observe-only test and confirm that the event appears in the correct Ferocity workspace.
7. Enable **Execute replies already approved in Ferocity** only after the observe-only test passes.

## Operational boundaries

This is an assisted browser connector, not an official Meta API integration. The browser must remain open and signed in. Facebook UI changes can require selector maintenance. The connector must never attempt to bypass platform security, verification, restrictions, rate limits, or terms.

Fresh installations should remain approval-first. Full autonomous sending should not be enabled until the exact customer identity has passed live observation, deduplication, reply, health-pause, and revocation tests.

## Certification before release

Prepared package: `public/downloads/ferocity-facebook-connector-0.1.0.zip`
SHA-256: `7D9633D3B87FB5DED9BE67ECCEDAC62FFC8330A8A6C582147C454E36410D722F`

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

## H4R integration boundary

H4R can continue using its own production connector. If H4R is later connected to Ferocity, it should use a separate Ferocity pairing session and `destination=ferocity`; no production H4R token should be copied or shared.
