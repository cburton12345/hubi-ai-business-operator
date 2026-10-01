import type { Config } from "@netlify/functions";

export default async function runConversionFeedbackSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) return new Response("Conversion feedback is not configured.", { status: 503 });
  const response = await fetch(new URL("/.netlify/functions/run-conversion-feedback-background", siteUrl), { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Conversion feedback dispatch failed (${response.status}).`);
  return new Response("Conversion feedback started.", { status: 202 });
}

export const config: Config = { schedule: "*/10 * * * *" };
