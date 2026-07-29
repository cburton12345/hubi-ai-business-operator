import type { Config, Context } from "@netlify/functions";

export default async function runBusinessAutomation(_request: Request, context: Context) {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) {
    console.error("Business automation schedule skipped: URL or AI_WORKFORCE_CRON_TOKEN is missing.");
    return new Response("Business automation is not configured.", { status: 503 });
  }

  const runUrl = new URL("/api/business-automation/run", siteUrl);
  runUrl.searchParams.set("tenantLimit", "100");
  runUrl.searchParams.set("agentLimit", "100");

  const run = fetch(runUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: "{}"
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Business automation request failed (${response.status}): ${body.slice(0, 500)}`);
    }
  });

  context.waitUntil(run);
  return new Response("Business automation started.", { status: 202 });
}

export const config: Config = {
  schedule: "*/15 * * * *"
};
