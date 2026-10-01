import type { Config } from "@netlify/functions";
import { runOrganicPublishingCadence } from "../../src/lib/marketing/run-organic-publishing-cadence";

export default async function runOrganicPublishingCadenceBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });
  const result = await runOrganicPublishingCadence();
  console.log("Organic publishing cadence completed", result);
  return new Response(null, { status: 204 });
}

export const config: Config = { background: true };
