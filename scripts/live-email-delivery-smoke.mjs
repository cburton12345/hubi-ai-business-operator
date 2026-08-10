import crypto from "node:crypto";
import fs from "node:fs";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

loadLocalEnv();

const recipient = process.env.EXTERNAL_TEST_EMAIL?.trim();
const apiKey = process.env.EMAIL_API_KEY?.trim();
const from = process.env.EMAIL_FROM_ADDRESS?.trim();
const replyTo = process.env.EMAIL_REPLY_TO_ADDRESS?.trim() || from;

if (!recipient) throw new Error("EXTERNAL_TEST_EMAIL is required.");
if ((process.env.EMAIL_PROVIDER || "").toLowerCase() !== "resend") {
  throw new Error("EMAIL_PROVIDER must be resend.");
}
if (!apiKey || !from) throw new Error("EMAIL_API_KEY and EMAIL_FROM_ADDRESS are required.");

const nonce = crypto.randomBytes(8).toString("hex");
const sentAt = new Date().toISOString();
const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `ferocity-live-email-smoke-${nonce}`
  },
  body: JSON.stringify({
    from,
    to: [recipient],
    reply_to: replyTo,
    subject: "Ferocity live email delivery test",
    text: `This is a controlled Ferocity launch-certification email sent at ${sentAt}. No action is required.`,
    html: `<p>This is a controlled Ferocity launch-certification email sent at <strong>${sentAt}</strong>.</p><p>No action is required.</p>`,
    tags: [
      { name: "source", value: "ferocity" },
      { name: "action", value: "launch_certification" }
    ]
  })
});

const body = await response.json().catch(() => null);
if (!response.ok || !body?.id) {
  throw new Error(`Resend delivery request failed with HTTP ${response.status}: ${body?.message || body?.error || "unknown error"}`);
}

console.log(JSON.stringify({ ok: true, provider: "resend", messageId: body.id, recipient, sentAt }, null, 2));
