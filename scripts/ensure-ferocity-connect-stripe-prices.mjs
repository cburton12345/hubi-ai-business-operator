import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
  throw new Error("A live Stripe secret key is required to certify production prices.");
}

async function stripe(path, body) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message ?? `Stripe ${path} failed.`);
  return json;
}

async function ensureProduct(key, name, description) {
  const products = await stripe("products?active=true&limit=100");
  const existing = products.data.find((product) => product.metadata?.ferocity_product_key === key);
  if (existing) return existing;
  return stripe("products", new URLSearchParams({
    name,
    description,
    "metadata[ferocity_product_key]": key
  }));
}

async function ensureMonthlyPrice(product, key, unitAmount) {
  const prices = await stripe(`prices?active=true&product=${encodeURIComponent(product.id)}&type=recurring&limit=100`);
  const existing = prices.data.find((price) => price.metadata?.ferocity_price_key === key && price.unit_amount === unitAmount && price.recurring?.interval === "month");
  if (existing) return existing;
  return stripe("prices", new URLSearchParams({
    product: product.id,
    currency: "usd",
    unit_amount: String(unitAmount),
    "recurring[interval]": "month",
    "metadata[ferocity_price_key]": key
  }));
}

const connectProduct = await ensureProduct(
  "ferocity_connect",
  "Ferocity Connect",
  "Approved Android business SMS transport with Ferocity safety and delivery controls."
);
const connectPrice = await ensureMonthlyPrice(connectProduct, "ferocity_connect_monthly", 2900);

const deviceProduct = await ensureProduct(
  "ferocity_connect_device",
  "Additional Ferocity Connect Device",
  "One additional paired Android device entitlement."
);
const devicePrice = await ensureMonthlyPrice(deviceProduct, "ferocity_connect_device_monthly", 1000);

console.log(JSON.stringify({
  connectPriceId: connectPrice.id,
  additionalDevicePriceId: devicePrice.id,
  currency: connectPrice.currency,
  connectMonthlyCents: connectPrice.unit_amount,
  additionalDeviceMonthlyCents: devicePrice.unit_amount
}, null, 2));
