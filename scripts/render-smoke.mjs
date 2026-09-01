const baseUrl = (process.env.RENDER_SMOKE_URL ?? process.env.FEROCITY_SMOKE_URL ?? "https://ferocity.live").replace(/\/$/, "");

const checks = [
  { path: "/", label: "public landing page", canonical: "https://ferocity.live" },
  { path: "/login", label: "login page" },
  { path: "/privacy", label: "privacy policy", canonical: "https://ferocity.live/privacy" },
  { path: "/terms", label: "terms of service", canonical: "https://ferocity.live/terms" },
  { path: "/sms-terms", label: "SMS terms", canonical: "https://ferocity.live/sms-terms" },
  { path: "/sms-consent", label: "SMS consent policy", canonical: "https://ferocity.live/sms-consent" },
  { path: "/sms-opt-in", label: "SMS opt-in", canonical: "https://ferocity.live/sms-opt-in" },
  { path: "/acceptable-use", label: "acceptable use policy", canonical: "https://ferocity.live/acceptable-use" },
  { path: "/contact-compliance", label: "contact and compliance", canonical: "https://ferocity.live/contact-compliance" },
  { path: "/support", label: "support", canonical: "https://ferocity.live/support" },
  { path: "/api/integrations/google/oauth/callback", label: "google OAuth callback guard", expectedStatuses: [400] }
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: "follow" });
  const allowedStatuses = check.expectedStatuses ?? [200];
  if (!allowedStatuses.includes(response.status)) {
    const responseBody = await response.text();
    throw new Error(`Render smoke failed for ${check.label}: ${response.status} ${response.statusText}\n${responseBody.slice(0, 2_000)}`);
  }
  if (check.canonical) {
    const responseBody = await response.text();
    const escapedCanonical = check.canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const canonicalPattern = new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${escapedCanonical}["']|<link[^>]+href=["']${escapedCanonical}["'][^>]+rel=["']canonical["']`, "i");
    if (!canonicalPattern.test(responseBody)) {
      throw new Error(`Render smoke failed for ${check.label}: expected canonical ${check.canonical}`);
    }
    if (/<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^>]+name=["']robots["'])/i.test(responseBody)) {
      throw new Error(`Render smoke failed for ${check.label}: public page contains noindex`);
    }
  }
}

console.log(`Smoke passed for ${baseUrl}`);
