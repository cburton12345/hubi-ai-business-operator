const baseUrl = (process.env.RENDER_SMOKE_URL ?? process.env.FEROCITY_SMOKE_URL ?? "https://ferocity.live").replace(/\/$/, "");

const checks = [
  { path: "/", label: "public landing page" },
  { path: "/login", label: "login page" },
  { path: "/privacy", label: "privacy policy" },
  { path: "/terms", label: "terms of service" },
  { path: "/sms-terms", label: "SMS terms" },
  { path: "/sms-consent", label: "SMS consent policy" },
  { path: "/sms-opt-in", label: "SMS opt-in" },
  { path: "/acceptable-use", label: "acceptable use policy" },
  { path: "/contact-compliance", label: "contact and compliance" },
  { path: "/api/integrations/google/oauth/callback", label: "google OAuth callback guard", expectedStatuses: [400] }
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: "follow" });
  const allowedStatuses = check.expectedStatuses ?? [200];
  if (!allowedStatuses.includes(response.status)) {
    const responseBody = await response.text();
    throw new Error(`Render smoke failed for ${check.label}: ${response.status} ${response.statusText}\n${responseBody.slice(0, 2_000)}`);
  }
}

console.log(`Smoke passed for ${baseUrl}`);
