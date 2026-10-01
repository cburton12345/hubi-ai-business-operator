import type { Config } from "@netlify/functions";
import { syncDueMailboxes } from "../../src/lib/integrations/mailbox/sync-all";

export default async function runMailboxSyncBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });
  const result = await syncDueMailboxes();
  console.log("Mailbox sync completed", { checked: result.checked, synced: result.synced, messagesSeen: result.messagesSeen, failureCount: result.failures.length });
  return new Response(null, { status: 204 });
}

export const config: Config = { background: true };
