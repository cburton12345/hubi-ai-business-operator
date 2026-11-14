import type { Config } from "@netlify/functions";
import { syncDueCalendars } from "../../src/lib/integrations/calendar/sync-all";
import { resurfaceDueNotifications } from "../../src/lib/push/resurface-due-notifications";

function boundedInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export default async function runCalendarSyncBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });
  const notificationResurface = await resurfaceDueNotifications(20);
  const result = await syncDueCalendars({
    limit: boundedInt(Netlify.env.get("CALENDAR_SYNC_BATCH_SIZE"), 100, 500),
    concurrency: boundedInt(Netlify.env.get("CALENDAR_SYNC_CONCURRENCY"), 2, 4),
  });
  console.log("Calendar sync completed", {
    checked: result.checked,
    synced: result.synced,
    failureCount: result.failures.length,
    notificationResurface,
  });
  return new Response(null, { status: 204 });
}

export const config: Config = { background: true };
