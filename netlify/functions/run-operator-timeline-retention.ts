import type { Config } from "@netlify/functions";

export default async function runOperatorTimelineRetentionSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) {
    return new Response("Operator timeline retention is not configured.", { status: 503 });
  }

  const response = await fetch(
    new URL("/.netlify/functions/run-operator-timeline-retention-background", siteUrl),
    { method: "POST", headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Operator timeline retention dispatch failed (${response.status}).`);
  return new Response("Operator timeline retention started.", { status: 202 });
}

// 09:11 UTC is 1:11 AM PST / 2:11 AM PDT and avoids the existing schedules.
export const config: Config = { schedule: "11 9 * * *" };
