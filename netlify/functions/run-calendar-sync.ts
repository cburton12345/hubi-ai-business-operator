import type { Config } from "@netlify/functions";

export default async function runCalendarSyncSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) {
    console.error("Calendar sync schedule skipped: URL or AI_WORKFORCE_CRON_TOKEN is missing.");
    return new Response("Calendar sync is not configured.", { status: 503 });
  }
  const response = await fetch(new URL("/.netlify/functions/run-calendar-sync-background", siteUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Calendar sync dispatch failed (${response.status}).`);
  return new Response("Calendar sync started.", { status: 202 });
}

export const config: Config = { schedule: "8,38 * * * *" };
