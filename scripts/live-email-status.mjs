import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

const messageId = process.env.EXTERNAL_TEST_MESSAGE_ID?.trim();
const apiKey = process.env.EMAIL_API_KEY?.trim();
if (!messageId || !apiKey) throw new Error("EXTERNAL_TEST_MESSAGE_ID and EMAIL_API_KEY are required.");

const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
  headers: { Authorization: `Bearer ${apiKey}` }
});
const body = await response.json().catch(() => null);
if (!response.ok) throw new Error(`Resend status check failed with HTTP ${response.status}.`);

console.log(JSON.stringify({
  ok: true,
  id: body?.id ?? messageId,
  from: body?.from ?? null,
  to: body?.to ?? [],
  subject: body?.subject ?? null,
  createdAt: body?.created_at ?? null,
  lastEvent: body?.last_event ?? null
}, null, 2));
