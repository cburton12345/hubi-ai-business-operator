import type { Config } from "@netlify/functions";

export default async function runBusinessAutomation() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) {
    console.error("Business automation schedule skipped: URL or AI_WORKFORCE_CRON_TOKEN is missing.");
    return new Response("Business automation is not configured.", { status: 503 });
  }

  const runUrl = new URL("/.netlify/functions/run-business-automation-background", siteUrl);

  const response = await fetch(runUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ source: "scheduled_business_automation" })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Business automation background dispatch failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return new Response("Business automation started.", { status: 202 });
}

export const config: Config = {
  schedule: "*/5 * * * *"
};
