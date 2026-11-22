import { timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";
import { pruneOperatorTimelineEvents } from "../../src/lib/automation-timeline/prune-operator-timeline";

function authorized(expected: string | undefined, supplied: string) {
  if (!expected) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export default async function runOperatorTimelineRetentionBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!authorized(token, supplied)) return new Response("Unauthorized", { status: 401 });

  const result = await pruneOperatorTimelineEvents();
  console.log("Operator timeline retention completed", result);
  return new Response(null, { status: 204 });
}

export const config: Config = { background: true };
