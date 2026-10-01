import type { Config } from "@netlify/functions";
import { runAiGrowthDepartmentSweep } from "../../src/lib/growth/ai-growth-department";

export default async function runAiGrowthDepartmentBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });
  const result = await runAiGrowthDepartmentSweep();
  console.log("AI Growth Department completed", result);
  return new Response(null, { status: 204 });
}

export const config: Config = { background: true };
