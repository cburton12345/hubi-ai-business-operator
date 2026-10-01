import type { Config } from "@netlify/functions";

export default async function runMailboxSyncSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) return new Response("Mailbox sync is not configured.", { status: 503 });
  const response = await fetch(new URL("/.netlify/functions/run-mailbox-sync-background", siteUrl), {
    method: "POST", headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Mailbox sync dispatch failed (${response.status}).`);
  return new Response("Mailbox sync started.", { status: 202 });
}

export const config: Config = { schedule: "*/15 * * * *" };
