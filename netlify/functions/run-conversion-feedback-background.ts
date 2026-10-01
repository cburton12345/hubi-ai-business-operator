import type { Config } from "@netlify/functions";
import { dispatchConversionFeedbackBatch } from "../../src/lib/growth/conversion-feedback";

export default async function runConversionFeedbackBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });
  console.log("Conversion feedback completed", await dispatchConversionFeedbackBatch());
  return new Response(null, { status: 204 });
}

export const config: Config = { background: true };
