import type { Config } from "@netlify/functions";

export default async function runOrganicPublishingCadenceSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) return new Response("Organic publishing cadence is not configured.", { status: 503 });

  const response = await fetch(new URL("/.netlify/functions/run-organic-publishing-cadence-background", siteUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Organic publishing cadence dispatch failed (${response.status}).`);
  return new Response("Organic publishing cadence started.", { status: 202 });
}

export const config: Config = { schedule: "17 8 * * *" };
