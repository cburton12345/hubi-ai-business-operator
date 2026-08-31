# Ferocity Facebook Connector

This Manifest V3 Edge/Chrome extension is a thin, customer-owned transport between a legitimate signed-in Facebook/Messenger browser session and one Ferocity workspace. It observes loaded conversation threads, sends normalized inbound events to Ferocity, reports account/session health, and can execute Ferocity-approved replies when the local sending switch is deliberately enabled.

It is not an official Meta API integration, does not contain Ferocity service credentials, and does not bypass Facebook login, 2FA, checkpoints, CAPTCHA, identity verification, restrictions, or platform rules.

## Safety defaults

- Fresh installs are observe-only.
- Pairing codes are single-use and expire after ten minutes.
- The extension receives a revocable device-scoped credential, never a Ferocity user session or database key.
- Each installation is bound to the workspace, brand, Facebook identity, and device chosen during pairing.
- Outbound work is claimed only after it has passed Ferocity's approval and identity-health gates and the local send switch is enabled.
- Verification, restriction, or an unknown Facebook layout pauses action execution and is reported to Ferocity.
- Only one approved action is claimed and processed at a time, with a local send lock and server idempotency.

## Install locally

1. Download and unzip the connector package from Ferocity.
2. Open `edge://extensions` or `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select this folder.
5. Pin **Ferocity Facebook Connector**.

## Pair to a workspace

1. In Ferocity, open **Growth → Distribution identities**.
2. Add or select the legitimate Facebook identity for the intended business.
3. Download the connector and create a pairing code.
4. Open the extension options, enter the pairing code and a recognizable device name, and select **Pair**.
5. Open Facebook login and sign in directly with Facebook. Never provide the password or verification code to Ferocity.
6. Start in observe-only mode and confirm that one harmless inbound test reaches the correct Ferocity workspace and conversation.
7. Enable approved-reply execution only after observation, deduplication, health, and approval behavior are verified.

## Important operating boundary

The browser must be open, signed in, and able to load the relevant Messenger threads. Facebook UI changes can require selector maintenance. Do not use a critical personal account for initial certification, and do not describe this assisted connector as an official Meta integration.
