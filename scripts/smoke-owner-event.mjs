import fs from "node:fs";
import pg from "pg";

const { Client } = pg;
const fallbackTenantId = "11111111-1111-4111-8111-111111111111";

const defaults = {
  "4bid": {
    platformName: "4Bid",
    eventType: "payment.issue",
    title: "4Bid owner event smoke test",
    summary: "Smoke test event from 4Bid into Ferocity.",
    riskType: "financial",
    moneyCents: 12500
  },
  marketplacepro: {
    platformName: "MarketplacePro",
    eventType: "marketplace.lead",
    title: "MarketplacePro owner event smoke test",
    summary: "Smoke test event from MarketplacePro into Ferocity.",
    riskType: "revenue",
    moneyCents: 90000
  },
  guardiansignal: {
    platformName: "GuardianSignal",
    eventType: "safety.alert",
    title: "GuardianSignal owner event smoke test",
    summary: "Smoke test safety escalation from GuardianSignal into Ferocity.",
    riskType: "safety",
    moneyCents: 0,
    severity: "critical",
    status: "critical"
  },
  bidops: {
    platformName: "BidOps / GovFlow",
    eventType: "deadline.contract",
    title: "BidOps owner event smoke test",
    summary: "Smoke test contract deadline from BidOps into Ferocity.",
    riskType: "approval",
    moneyCents: 0,
    severity: "high"
  }
};

function unquote(value = "") {
  return value.replace(/^['"]|['"]$/g, "");
}

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return {};
  return Object.fromEntries(
    fs.readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), unquote(line.slice(index + 1))];
      })
  );
}

const localEnv = loadLocalEnv();
const env = { ...localEnv, ...process.env };
const platformKey = (process.argv[2] || env.FEROCITY_OWNER_SMOKE_PLATFORM || "4bid").toLowerCase();
const preset = defaults[platformKey] || {
  platformName: platformKey,
  eventType: "system.notice",
  title: `${platformKey} owner event smoke test`,
  summary: `Smoke test event from ${platformKey} into Ferocity.`,
  riskType: "approval",
  moneyCents: 0
};

const url = env.FEROCITY_OWNER_EVENTS_URL || "http://localhost:3017/api/owner-command-center/events";
const token = env.FEROCITY_OWNER_EVENTS_TOKEN || env.OWNER_COMMAND_CENTER_TOKEN;
const tenantId = env.FEROCITY_TENANT_ID || fallbackTenantId;
const externalEventId = `${platformKey}-smoke-${Date.now()}`;

if (!token) {
  console.error("Missing FEROCITY_OWNER_EVENTS_TOKEN or OWNER_COMMAND_CENTER_TOKEN.");
  process.exit(1);
}

const payload = {
  tenantId,
  platformKey,
  platformName: preset.platformName,
  externalEventId,
  eventType: process.env.FEROCITY_OWNER_SMOKE_EVENT_TYPE || preset.eventType,
  title: preset.title,
  summary: preset.summary,
  severity: preset.severity || "high",
  status: preset.status || "needs_owner",
  ownerAttention: true,
  aiHandled: false,
  aiSummary: "Ferocity received this owner event and can show it in the owner queue.",
  recommendedAction: "Open the source system, verify the event, and decide the next step.",
  actionHref: "/app/owner-command-center",
  moneyCents: preset.moneyCents,
  riskType: preset.riskType,
  confidenceScore: 91,
  metadata: {
    source: "scripts/smoke-owner-event.mjs",
    smokePlatform: platformKey
  }
};

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(payload)
});

const body = await response.json().catch(() => ({}));
console.log(`platform=${platformKey}`);
console.log(`post_status=${response.status}`);
console.log(`saved=${Boolean(body.ok)} event_id=${body.id ? "present" : "missing"}`);

if (!response.ok || !body.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (env.DATABASE_URL) {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    const result = await client.query(
      `
      select id, platform_key, platform_name, event_type, status, owner_attention
      from public.owner_command_events
      where tenant_id = $1 and platform_key = $2 and external_event_id = $3
      limit 1
      `,
      [tenantId, platformKey, externalEventId]
    );
    console.log(`db_visible=${result.rowCount === 1}`);
    if (process.env.KEEP_OWNER_TEST_EVENT !== "1") {
      await client.query(
        "delete from public.owner_command_events where tenant_id = $1 and platform_key = $2 and external_event_id = $3",
        [tenantId, platformKey, externalEventId]
      );
      console.log("cleanup=done");
    } else {
      console.log("cleanup=kept");
    }
  } finally {
    await client.end();
  }
}
