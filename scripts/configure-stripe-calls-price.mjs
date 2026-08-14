import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_live_")) throw new Error("A live STRIPE_SECRET_KEY is required.");

async function stripe(path, init = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? `Stripe request failed (${response.status}).`);
  return body;
}

const products = await stripe("/products?active=true&limit=100");
let product = products.data.find((item) => item.metadata?.ferocity_plan === "calls") ?? null;
if (!product) {
  product = await stripe("/products", {
    method: "POST",
    body: new URLSearchParams({
      name: "Ferocity Calls",
      description: "AI phone operations connected to the Ferocity Business Brain.",
      "metadata[ferocity_plan]": "calls"
    })
  });
}

const prices = await stripe(`/prices?active=true&type=recurring&limit=100&product=${encodeURIComponent(product.id)}`);
let price = prices.data.find((item) =>
  item.currency === "usd" && item.unit_amount === 4900 && item.recurring?.interval === "month"
) ?? null;
if (!price) {
  price = await stripe("/prices", {
    method: "POST",
    body: new URLSearchParams({
      product: product.id,
      currency: "usd",
      unit_amount: "4900",
      "recurring[interval]": "month",
      "metadata[ferocity_plan]": "calls"
    })
  });
}

console.log(JSON.stringify({ ok: true, productId: product.id, priceId: price.id, amount: price.unit_amount, interval: price.recurring?.interval }));
