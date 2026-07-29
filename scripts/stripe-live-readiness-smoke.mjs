import fs from "node:fs";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function line(label, detail) {
  console.log(`${label.padEnd(30)} ${detail}`);
}

async function stripeRequest(path, body) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const message = json?.error?.message ?? text.slice(0, 300);
    throw new Error(`Stripe ${path} failed (${response.status}): ${message}`);
  }
  return json;
}

loadLocalEnv();

const priceEnvKeys = [
  "STRIPE_PRICE_ID_JOB_TRACKER",
  "STRIPE_PRICE_ID_STARTER",
  "STRIPE_PRICE_ID_GROWTH",
  "STRIPE_PRICE_ID_OPERATOR",
  "STRIPE_PRICE_ID_AI_GROWTH_REPORT"
];

assert(process.env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY is required.");
assert(process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") || process.env.STRIPE_SECRET_KEY.startsWith("rk_live_"), "Stripe smoke expected a live secret or restricted live key.");
assert(process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"), "STRIPE_WEBHOOK_SECRET should be set and start with whsec_.");

const presentPrices = priceEnvKeys.filter((key) => process.env[key]);
assert(presentPrices.length >= 4, "Expected at least Job Tracker, Starter, Growth, and Operator price IDs.");

line("Stripe key mode", process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live secret" : "live restricted");
line("Webhook secret", "configured");

for (const key of presentPrices) {
  const price = await stripeRequest(`prices/${encodeURIComponent(process.env[key])}`);
  assert(price.active, `${key} is not active.`);
  assert(price.recurring?.interval === "month" || key === "STRIPE_PRICE_ID_AI_GROWTH_REPORT", `${key} should be monthly recurring unless it is the optional report price.`);
  line(key, `${price.id} / ${price.currency?.toUpperCase() ?? "USD"} / ${price.unit_amount ?? "custom"} / ${price.recurring?.interval ?? "one-time"}`);
}

const checkoutPrice = process.env.STRIPE_PRICE_ID_STARTER ?? process.env.STRIPE_PRICE_ID_JOB_TRACKER;
assert(checkoutPrice, "No checkout price available.");

const checkoutBody = new URLSearchParams({
  mode: "subscription",
  "line_items[0][price]": checkoutPrice,
  "line_items[0][quantity]": "1",
  success_url: "https://ferocity.live/checkout/success?smoke=1&session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://ferocity.live/checkout/cancel?smoke=1",
  client_reference_id: "ferocity-local-stripe-smoke",
  "metadata[ferocity_smoke]": "true",
  "subscription_data[metadata][ferocity_smoke]": "true"
});

const checkout = await stripeRequest("checkout/sessions", checkoutBody);
assert(checkout.id && checkout.url, "Checkout session did not return an id and url.");
line("Checkout session", `${checkout.id} created`);

await stripeRequest(`checkout/sessions/${encodeURIComponent(checkout.id)}/expire`, new URLSearchParams());
line("Checkout session", `${checkout.id} expired without payment`);
console.log("Stripe live readiness smoke passed.");
