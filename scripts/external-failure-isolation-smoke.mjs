const appUrl = (process.env.EXTERNAL_TEST_APP_URL || "https://ferocity.live").replace(/\/+$/, "");

async function request(path, init) {
  const response = await fetch(`${appUrl}${path}`, { redirect: "manual", ...init });
  return { path, status: response.status, location: response.headers.get("location") };
}

const badStripe = await request("/api/integrations/stripe/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=invalid" },
  body: JSON.stringify({ id: "evt_launch_isolation_invalid", type: "checkout.session.completed" })
});
if (![400, 401].includes(badStripe.status)) throw new Error(`Invalid Stripe webhook was not rejected: ${badStripe.status}`);

const badVoice = await request("/api/integrations/voice-ai/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Retell-Signature": "v=1,d=invalid" },
  body: JSON.stringify({ event: "call_ended", call: { call_id: "launch-isolation-invalid" } })
});
if (![400, 401].includes(badVoice.status)) throw new Error(`Invalid voice webhook was not rejected: ${badVoice.status}`);

const health = await fetch(`${appUrl}/health`, { redirect: "manual" });
if (health.status !== 200) throw new Error(`Application health failed after provider errors: ${health.status}`);

const homepage = await fetch(`${appUrl}/`, { redirect: "manual" });
if (homepage.status !== 200) throw new Error(`Homepage failed after provider errors: ${homepage.status}`);

console.log(JSON.stringify({
  ok: true,
  rejectedProviderRequests: [badStripe, badVoice],
  applicationAfterFailures: { health: health.status, homepage: homepage.status }
}, null, 2));
