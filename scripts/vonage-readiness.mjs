import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const value = (key) => process.env[key]?.trim() || "";
const fromNumber = value("VONAGE_FROM_NUMBER") || value("VONAGE_SMS_FROM");
const appUrl = value("FEROCITY_APP_URL") || value("NEXT_PUBLIC_APP_URL");
const required = {
  apiKey: Boolean(value("VONAGE_API_KEY")),
  apiSecret: Boolean(value("VONAGE_API_SECRET")),
  fromNumber: Boolean(fromNumber),
  signatureSecret: Boolean(value("VONAGE_SIGNATURE_SECRET")),
  appUrl: /^https:\/\//i.test(appUrl),
  sendsEnabled: value("ENABLE_VONAGE_SMS_SENDS") === "true"
};

let credentialsAccepted = false;
let balance = null;
let balanceCurrency = null;
let credentialError = null;
if (required.apiKey && required.apiSecret) {
  try {
    const authorization = Buffer.from(`${value("VONAGE_API_KEY")}:${value("VONAGE_API_SECRET")}`).toString("base64");
    const response = await fetch("https://rest.nexmo.com/account/get-balance", {
      headers: { Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.json().catch(() => ({}));
    credentialsAccepted = response.ok && typeof payload.value === "number";
    if (credentialsAccepted) {
      balance = payload.value;
      balanceCurrency = "EUR";
    } else {
      credentialError = `HTTP ${response.status}`;
    }
  } catch (error) {
    credentialError = error instanceof Error ? error.message : "Account check failed.";
  }
}

const liveReady = Object.values(required).every(Boolean) && credentialsAccepted;
console.log(JSON.stringify({
  ok: liveReady,
  safeReadOnlyCheck: true,
  messageSent: false,
  credentialsAccepted,
  credentialError,
  balance,
  balanceCurrency,
  senderConfigured: required.fromNumber,
  signatureVerificationConfigured: required.signatureSecret,
  sendsEnabled: required.sendsEnabled,
  statusWebhookUrl: required.appUrl ? `${appUrl.replace(/\/+$/, "")}/api/messaging/webhooks/vonage` : null,
  inboundWebhookUrl: required.appUrl ? `${appUrl.replace(/\/+$/, "")}/api/messaging/webhooks/vonage` : null,
  missing: Object.entries(required).filter(([, configured]) => !configured).map(([key]) => key),
  nextStep: liveReady
    ? "Run one consented send/receive certification and verify submitted, delivered, inbound, STOP, HELP, usage, and cost evidence."
    : "Add valid Vonage credentials, an approved sender/number, the Vonage signature secret, and completed US registration before enabling sends."
}, null, 2));
