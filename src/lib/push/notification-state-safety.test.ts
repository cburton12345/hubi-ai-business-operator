import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("notification snooze and clear safety", () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/288_notification_snooze_and_resurface.sql"),
    "utf8",
  );
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), "src/lib/push/get-push-notification-dashboard.ts"),
    "utf8",
  );
  const action = fs.readFileSync(
    path.join(process.cwd(), "src/app/app/notifications/state-actions.ts"),
    "utf8",
  );

  it("uses soft state instead of deleting source notifications", () => {
    expect(migration).toContain("'snoozed','cleared'");
    expect(migration).toContain("snoozed_until is not null");
    expect(action).toContain("Notification cleared");
    expect(action).not.toMatch(/delete\s+from\s+public\.in_app_notification_states/i);
  });

  it("automatically resurfaces expired snoozes with evidence", () => {
    expect(dashboard).toContain("status='snoozed' and snoozed_until <= now()");
    expect(dashboard).toContain("resurface_count=resurface_count+1");
    expect(dashboard).toContain("last_resurfaced_at=now()");
    expect(dashboard).toContain("not in ('dismissed','cleared','snoozed')");
  });

  it("bounds owner-selected snooze windows", () => {
    expect(action).toContain("Date.now() + 5 * 60_000");
    expect(action).toContain("Date.now() + 366 * 24 * 60 * 60_000");
  });
});
