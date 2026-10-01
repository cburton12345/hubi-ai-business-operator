const plans = [
  { key: "STARTER", name: "Starter", monthly: 14900, annual: 149000 },
  { key: "GROWTH", name: "Growth", monthly: 34900, annual: 349000 },
  { key: "OPERATOR", name: "Operator", monthly: 69900, annual: 699000 }
];

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) throw new Error("STRIPE_SECRET_KEY is required.");

async function stripe(path, init = {}) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...init.headers
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Stripe request failed (${response.status}).`);
  return body;
}

async function findOrCreatePrice(product, amount, interval, lookupKey) {
  const search = await stripe(`prices?product=${encodeURIComponent(product)}&active=true&limit=100`);
  const existing = search.data?.find((price) => price.currency === "usd" && price.unit_amount === amount && price.recurring?.interval === interval);
  if (existing) return existing.id;
  const params = new URLSearchParams({
    product,
    currency: "usd",
    unit_amount: String(amount),
    "recurring[interval]": interval,
    lookup_key: lookupKey,
    "metadata[commercial_reset]": "2026-09-26",
    "metadata[existing_subscriptions_preserved]": "true"
  });
  const created = await stripe("prices", { method: "POST", body: params });
  return created.id;
}

const result = {};
for (const plan of plans) {
  const oldPriceId = process.env[`STRIPE_PRICE_ID_${plan.key}`];
  if (!oldPriceId) throw new Error(`STRIPE_PRICE_ID_${plan.key} is required to preserve the existing product.`);
  const oldPrice = await stripe(`prices/${encodeURIComponent(oldPriceId)}`);
  const product = typeof oldPrice.product === "string" ? oldPrice.product : oldPrice.product?.id;
  if (!product) throw new Error(`Could not resolve the ${plan.name} Stripe product.`);
  result[`STRIPE_PRICE_ID_${plan.key}`] = await findOrCreatePrice(product, plan.monthly, "month", `ferocity_${plan.key.toLowerCase()}_monthly_2026_09`);
  result[`STRIPE_PRICE_ID_${plan.key}_ANNUAL`] = await findOrCreatePrice(product, plan.annual, "year", `ferocity_${plan.key.toLowerCase()}_annual_2026_09`);
}

console.log(JSON.stringify(result, null, 2));
