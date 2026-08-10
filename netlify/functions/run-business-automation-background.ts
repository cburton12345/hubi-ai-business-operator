import type { Config } from "@netlify/functions";
import { runBusinessAutomationLoop } from "../../src/lib/automation/run-business-automation";

function boundedInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export default async function runBusinessAutomationBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runBusinessAutomationLoop({
    tenantLimit: boundedInt(Netlify.env.get("AUTOMATION_TENANT_BATCH_SIZE"), 50, 250),
    agentLimit: boundedInt(Netlify.env.get("AUTOMATION_AGENT_BATCH_SIZE"), 50, 250),
    tenantConcurrency: boundedInt(Netlify.env.get("AUTOMATION_TENANT_CONCURRENCY"), 2, 4)
  });
  console.log("Business automation background run completed", {
    skipped: result.skipped,
    tenantsChecked: "tenantsChecked" in result ? result.tenantsChecked : 0,
    tenantFailures: "tenantFailures" in result ? result.tenantFailures.length : 0,
    elapsedMs: result.elapsedMs
  });

  return new Response(null, { status: 204 });
}

export const config: Config = {
  background: true
};
