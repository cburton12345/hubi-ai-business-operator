import type { Config } from "@netlify/functions";

export default async function runAiGrowthDepartmentSchedule() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) return new Response("AI Growth Department is not configured.", { status: 503 });

  const response = await fetch(new URL("/.netlify/functions/run-ai-growth-department-background", siteUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`AI Growth Department dispatch failed (${response.status}).`);
  return new Response("AI Growth Department started.", { status: 202 });
}

export const config: Config = { schedule: "43 7 * * *" };
