# In-app Ferocity voice

## What is implemented

The primary Ferocity conversation supports two browser voice modes:

- **Dictate:** captures one spoken message, places the transcript in the composer, and waits for the user to review and click Send.
- **Voice chat:** captures a spoken turn, submits it to the same Ferocity command path used by typed chat, reads Ferocity's response aloud, and listens for the next turn.

Both modes use the existing Business Brain, thread history, capability discovery, authority rules, approvals, and audit trail. Voice is an input and output surface, not a separate agent or a second business-logic system.

## Safety boundary

Spoken instructions never count as approval for a protected action. Voice can ask Ferocity to analyze or prepare work, but these actions still require a physical on-screen confirmation where the existing authority system requires one:

- sending customer-facing messages
- publishing content or campaigns
- starting or increasing advertising spend
- charging, paying, refunding, or transferring money
- approving payouts
- other provider actions governed by workspace policy

Approval controls remain ordinary on-screen forms. Voice chat does not invoke them.

Voice-originated turns are recorded with an `inputMode` value so the audit trail can distinguish typed, dictated, and voice-conversation requests.

## Browser behavior

The current implementation uses browser speech recognition and speech synthesis. Chrome and Edge provide the intended experience. If recognition is unavailable or microphone permission is denied, the typed chat continues to work and the UI explains the issue.

## Provider-backed realtime upgrade

For lower-latency, full-duplex voice later, keep the existing Ferocity command and approval layers and replace only the transport. The preferred web architecture is WebRTC with a short-lived client secret minted by a server endpoint. A standard provider API key must remain server-side.

That upgrade must preserve these invariants:

1. the browser receives only an ephemeral credential;
2. every business action still enters through Ferocity's provider-neutral action layer;
3. protected actions become approval records rather than executing from a spoken phrase;
4. interruptions and partial transcripts never create duplicate actions;
5. the final transcript, tool calls, decisions, and approval outcome remain auditable.

Reference: https://developers.openai.com/api/docs/guides/realtime

## Deployment note

These changes are source-only until the frontend is deliberately deployed. No deployment was performed as part of this implementation.
