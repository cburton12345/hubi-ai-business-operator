import type { Config } from "@netlify/functions";

export default async function runWeatherDemandMonitorSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) {
    console.error("Weather demand monitor skipped: URL or AI_WORKFORCE_CRON_TOKEN is missing.");
    return new Response("Weather demand monitor is not configured.", { status: 503 });
  }

  const runUrl = new URL("/.netlify/functions/run-weather-demand-monitor-background", siteUrl);
  const response = await fetch(runUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ source: "scheduled_weather_demand_monitor" })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Weather monitor dispatch failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return new Response("Weather demand monitor started.", { status: 202 });
}

export const config: Config = {
  schedule: "*/15 * * * *"
};
