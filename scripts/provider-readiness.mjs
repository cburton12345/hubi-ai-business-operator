import fs from "node:fs";

const providerTruth = JSON.parse(fs.readFileSync("src/lib/integrations/provider-capability-truth.json", "utf8")).providers;
const truthKeyByLabel = {
  "Google/GBP connection": "google_business_profile",
  "Meta connection": "facebook",
  "TikTok connection": "tiktok_business",
  "Reddit connection": "reddit",
  "Microsoft connection": "microsoft_ads",
  "LinkedIn Ads connection": "linkedin_ads",
  "Pinterest Ads connection": "pinterest_ads",
  "Snap Ads connection": "snapchat_ads",
  "Amazon Ads connection": "amazon_ads",
  "X Ads connection": "x_ads",
  "Premium video rendering": "premium_video_rendering",
  "AI Office Manager voice": "voice_ai",
  "Optional Vonage SMS": "vonage_sms",
  "Optional Twilio SMS": "twilio_shared"
};

function loadLocalEnv() {
  if (process.env.SKIP_LOCAL_ENV === "1") return;
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = rawValue.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    process.env[key] = value;
  }
}

function has(key) {
  return Boolean(process.env[key]?.trim());
}

function redactedMode(key) {
  const value = process.env[key] ?? "";
  if (!value) return "missing";
  if (value.includes("YOUR_") || value.includes("CHANGE_ME")) return "placeholder";
  if (value.startsWith("sk_live") || value.startsWith("rk_live")) return "live";
  if (value.startsWith("sk_test") || value.startsWith("rk_test")) return "test";
  if (value.startsWith("re_")) return "present";
  return "present";
}

function row(label, status, detail = "") {
  const mark = status === "ready" ? "OK" : status === "warning" ? "WARN" : status === "blocked" ? "BLOCKED" : "INFO";
  console.log(`${mark.padEnd(7)} ${label}${detail ? ` - ${detail}` : ""}`);
}

function missing(keys) {
  return keys.filter((key) => !has(key));
}

async function checkJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function checkResend() {
  const needed = ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "FEROCITY_NOTIFY_EMAIL"];
  const gaps = missing(needed);
  const provider = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  if (provider && provider !== "resend") {
    row("Resend email", "blocked", `EMAIL_PROVIDER is ${provider}; live sender supports resend.`);
    return false;
  }
  if (gaps.length) {
    row("Resend email", "blocked", `missing ${gaps.join(", ")}`);
    return false;
  }

  const response = await checkJson("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}` }
  }).catch((error) => ({ ok: false, status: 0, body: error instanceof Error ? error.message : "request failed" }));

  if (!response.ok) {
    row("Resend email", "blocked", `provider check failed with HTTP ${response.status}`);
    return false;
  }

  const domains = Array.isArray(response.body?.data) ? response.body.data : [];
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "";
  const senderDomain = domains.find((item) => item?.name && fromAddress.endsWith(`@${item.name}`));
  const domainText = senderDomain?.name
    ? `${senderDomain.name} status ${senderDomain.status ?? "listed"}`
    : "API key accepted; sender domain was not matched in domain list";
  row("Resend email", senderDomain?.status === "verified" ? "ready" : "warning", domainText);
  return true;
}

async function checkStripe() {
  const priceKeys = [
    "STRIPE_PRICE_ID_JOB_TRACKER",
    "STRIPE_PRICE_ID_CALLS",
    "STRIPE_PRICE_ID_FEROCITY_CONNECT",
    "STRIPE_PRICE_ID_STARTER",
    "STRIPE_PRICE_ID_GROWTH",
    "STRIPE_PRICE_ID_OPERATOR",
    "STRIPE_PRICE_ID_AI_GROWTH_REPORT"
  ];
  const gaps = missing(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", ...priceKeys]);
  if (gaps.length) {
    row("Stripe subscriptions", "blocked", `missing ${gaps.join(", ")}`);
    return false;
  }

  const keyMode = redactedMode("STRIPE_SECRET_KEY");
  let okCount = 0;
  for (const key of priceKeys) {
    const priceId = process.env[key];
    const response = await checkJson(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    }).catch((error) => ({ ok: false, status: 0, body: error instanceof Error ? error.message : "request failed" }));
    if (response.ok) {
      okCount += 1;
    } else {
      row("Stripe price check", "blocked", `${key} rejected with HTTP ${response.status}`);
    }
  }

  row("Stripe subscriptions", okCount === priceKeys.length ? "ready" : "blocked", `${okCount}/${priceKeys.length} prices readable using ${keyMode} key`);
  return okCount === priceKeys.length;
}

async function checkOpenAi() {
  if (!has("OPENAI_API_KEY")) {
    row("OpenAI", "blocked", "missing OPENAI_API_KEY; AI will use safe fallback plans.");
    return false;
  }
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const configuredBase = process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "");
  const baseUrl = configuredBase
    ? (configuredBase.endsWith("/v1") ? configuredBase : `${configuredBase}/v1`)
    : "https://api.openai.com/v1";
  const response = await checkJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply only OK" }],
      max_tokens: 3
    })
  }).catch((error) => ({ ok: false, status: 0, body: error instanceof Error ? error.message : "request failed" }));
  row("OpenAI", response.ok ? "ready" : "blocked", response.ok ? `${model} is reachable` : `model check failed with HTTP ${response.status}`);
  return response.ok;
}

function checkStaticGroups() {
  const groups = [
    ["Core app", ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_ACCESS_TOKEN", "FEROCITY_APP_URL"]],
    ["Security tokenization", ["SECURITY_HMAC_KEY"]],
    ["Credential vault", ["CREDENTIAL_ENCRYPTION_KEY"]],
    ["Owner command intake", ["OWNER_COMMAND_CENTER_TOKEN"]],
    ["AI monitor jobs", ["AI_WORKFORCE_CRON_TOKEN"]],
    ["Workforce intake", ["WORKFORCE_INTAKE_TOKEN"]],
    ["MarketplacePro bridge", ["MARKETPLACEPRO_WEBHOOK_SECRET"]],
    ["Push notifications", ["NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"]],
    ["Google/GBP connection", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]],
    [
      "Meta connection",
      ["META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI", "META_BUSINESS_LOGIN_CONFIG_ID"]
    ],
    ["TikTok connection", ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_OAUTH_REDIRECT_URI"]],
    ["Reddit connection", ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_OAUTH_REDIRECT_URI"]],
    ["Microsoft connection", ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_OAUTH_REDIRECT_URI"]],
    ["LinkedIn Ads connection", ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_OAUTH_REDIRECT_URI"]],
    ["Pinterest Ads connection", ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET", "PINTEREST_OAUTH_REDIRECT_URI"]],
    ["Snap Ads connection", ["SNAPCHAT_CLIENT_ID", "SNAPCHAT_CLIENT_SECRET", "SNAPCHAT_OAUTH_REDIRECT_URI"]],
    ["Amazon Ads connection", ["AMAZON_ADS_CLIENT_ID", "AMAZON_ADS_CLIENT_SECRET", "AMAZON_ADS_OAUTH_REDIRECT_URI"]],
    ["X Ads connection", ["X_ADS_CONSUMER_KEY", "X_ADS_CONSUMER_SECRET", "X_ADS_OAUTH_REDIRECT_URI"]],
    ["Yahoo connection", ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_OAUTH_REDIRECT_URI"]],
    ["Premium video rendering", [
      "VIDEO_PROVIDER",
      "VIDEO_API_KEY",
      "VIDEO_MODEL",
      "VIDEO_RENDERING_ENABLED",
      "VIDEO_MONTHLY_BUDGET_CENTS",
      "VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS",
      "VIDEO_PROVIDER_COST_CENTS_PER_SECOND",
      "VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND"
    ]],
    ["AI Office Manager voice", ["VOICE_PROVIDER", "VOICE_API_KEY", "VOICE_WEBHOOK_SECRET", "VOICE_PHONE_NUMBER", "VOICE_MONTHLY_BUDGET_CENTS"]],
    ["Optional Vonage SMS", ["VONAGE_API_KEY", "VONAGE_API_SECRET", "VONAGE_FROM_NUMBER", "VONAGE_SIGNATURE_SECRET", "ENABLE_VONAGE_SMS_SENDS"]],
    ["Optional Twilio SMS", ["ENABLE_TWILIO_SMS_SENDS", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]]
  ];

  const results = [];
  for (const [label, keys] of groups) {
    let gaps = missing(keys);
    if (
      label === "Premium video rendering"
      && ["openai", "openai_video"].includes((process.env.VIDEO_PROVIDER ?? "").trim().toLowerCase())
      && has("OPENAI_API_KEY")
    ) {
      gaps = gaps.filter((key) => key !== "VIDEO_API_KEY");
    }
    if (label === "AI Office Manager voice" && has("RETELL_API_KEY")) {
      gaps = gaps.filter((key) => !["VOICE_PROVIDER", "VOICE_API_KEY", "VOICE_WEBHOOK_SECRET"].includes(key));
    }
    if (label === "AI Office Manager voice" && has("VAPI_API_KEY")) {
      gaps = gaps.filter((key) => !["VOICE_PROVIDER", "VOICE_API_KEY", "VOICE_WEBHOOK_SECRET"].includes(key));
    }
    if (label === "Optional Vonage SMS" && has("VONAGE_SMS_FROM")) {
      gaps = gaps.filter((key) => key !== "VONAGE_FROM_NUMBER");
    }
    const optional = ["Google/GBP connection", "Meta connection", "TikTok connection", "Reddit connection", "Microsoft connection", "LinkedIn Ads connection", "Pinterest Ads connection", "Snap Ads connection", "Amazon Ads connection", "X Ads connection", "Yahoo connection", "Premium video rendering", "AI Office Manager voice", "Optional Vonage SMS", "Optional Twilio SMS"].includes(label);
    const truth = providerTruth[truthKeyByLabel[label]];
    const status = gaps.length === 0
      ? truth && truth.state !== "certified_live" ? "warning" : "ready"
      : optional ? "warning" : "blocked";
    const missingDetail = label === "Optional Vonage SMS" && gaps.length
      ? `not required for launch; live use remains disabled until credentials, sender registration, signed webhooks, funding, and certification are complete`
      : label === "Optional Twilio SMS" && gaps.length
      ? `not required for launch; using app alerts, email, dashboard queues, and manual text drafts`
      : label === "AI Office Manager voice" && gaps.length
        ? `not required for launch; office-manager setup works now, live calls need ${gaps.join(", ")}`
      : label === "Premium video rendering" && gaps.length
        ? `not required for launch; video briefs work now, live renders need ${gaps.join(", ")}`
      : gaps.length ? `missing ${gaps.join(", ")}` : "credentials configured";
    const detail = truth
      ? `${missingDetail}; provider truth: ${truth.state.replaceAll("_", " ")} — ${truth.summary}`
      : missingDetail;
    row(label, status, detail);
    results.push({ label, ok: gaps.length === 0, gaps });
  }
  return results;
}

loadLocalEnv();

console.log("Ferocity provider readiness");
console.log("----------------------------");
const staticResults = checkStaticGroups();
const liveResults = [
  await checkResend(),
  await checkStripe(),
  await checkOpenAi()
];

const requiredStatic = staticResults.filter((item) =>
  ["Core app", "Security tokenization", "Credential vault", "Owner command intake", "AI monitor jobs", "Workforce intake", "MarketplacePro bridge", "Push notifications"].includes(item.label)
);
const blockers = [
  ...requiredStatic.filter((item) => !item.ok).map((item) => item.label),
  ...liveResults.map((ok, index) => (ok ? null : ["Resend email", "Stripe subscriptions", "OpenAI"][index])).filter(Boolean)
];

console.log("----------------------------");
if (blockers.length) {
  row("Launch truth", "blocked", `resolve/check: ${blockers.join(", ")}`);
  process.exitCode = 1;
} else {
  row("Launch truth", "ready", "core app, owner events, push, Resend, Stripe, and OpenAI are configured enough for live testing.");
}
