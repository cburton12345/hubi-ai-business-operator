import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  source: vi.fn(),
  preferences: vi.fn(),
  allowPush: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/push/notification-sources", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/push/notification-sources")>();
  return { ...original, getActiveNotificationSource: mocks.source };
});
vi.mock("@/lib/push/preferences", () => ({
  getPushNotificationPreferences: mocks.preferences,
  pushPreferencesAllowEvent: mocks.allowPush,
}));
vi.mock("@/lib/push/send-workspace-push", () => ({ sendWorkspacePushNotifications: mocks.sendPush }));

import { setNotificationState } from "./notification-state";
import { resurfaceDueNotifications } from "./resurface-due-notifications";

const dueState = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  user_id: "33333333-3333-4333-8333-333333333333",
  source_type: "owner_event",
  source_id: "44444444-4444-4444-8444-444444444444",
  last_resurfaced_at: new Date("2026-11-14T18:00:00.000Z"),
  resurface_count: 2,
} as const;

const activeSource = {
  id: dueState.source_id,
  source: "owner_event",
  title: "Payment needs review",
  body: "A customer payment needs owner review.",
  severity: "high",
  status: "needs_owner",
  actionUrl: "/app/owner-command-center",
  sourceUpdatedAt: "2026-11-14T17:00:00.000Z",
  ownerAttention: true,
  moneyCents: 0,
  riskType: "financial",
} as const;

describe("notification state safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T17:00:00.000Z"));
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => vi.useRealTimers());

  it("rejects a cross-workspace or inactive source before writing state", async () => {
    mocks.source.mockResolvedValue(null);
    const result = await setNotificationState({
      tenantId: dueState.tenant_id,
      userId: dueState.user_id,
      source: "owner_event",
      sourceId: dueState.source_id,
      status: "cleared",
    });
    expect(result).toEqual({ ok: false, reason: "source_not_found" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("bounds every snooze path before looking up or mutating a source", async () => {
    const result = await setNotificationState({
      tenantId: dueState.tenant_id,
      userId: dueState.user_id,
      source: "owner_event",
      sourceId: dueState.source_id,
      status: "snoozed",
      snoozedUntil: new Date("2026-11-14T17:02:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_snooze" });
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("soft-clears an authorized notification and preserves an audit record", async () => {
    mocks.source.mockResolvedValue(activeSource);
    mocks.query.mockResolvedValueOnce({ rows: [{ id: dueState.id }] }).mockResolvedValueOnce({ rows: [] });
    const result = await setNotificationState({
      tenantId: dueState.tenant_id,
      userId: dueState.user_id,
      source: "owner_event",
      sourceId: dueState.source_id,
      status: "cleared",
    });
    expect(result).toEqual({ ok: true, stateId: dueState.id });
    expect(mocks.query.mock.calls[0][0]).toContain("returning id");
    expect(mocks.query.mock.calls[0][0]).not.toMatch(/delete\s+from/i);
    expect(mocks.query.mock.calls[1][0]).toContain("notification_state_changed");
  });
});

describe("scheduled notification resurfacing", () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it("claims due snoozes once, records evidence, and honors push preferences", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [dueState] }).mockResolvedValueOnce({ rows: [] });
    mocks.source.mockResolvedValue(activeSource);
    mocks.preferences.mockResolvedValue({ ownerAlertsEnabled: true, minSeverity: "high" });
    mocks.allowPush.mockReturnValue(true);
    mocks.sendPush.mockResolvedValue({ ok: true, sent: 1, failed: 0, skipped: false, subscriptionCount: 1, missing: [] });
    const result = await resurfaceDueNotifications(20);
    expect(result).toMatchObject({ ok: true, claimed: 1, resurfaced: 1, pushSent: 1, failed: 0 });
    expect(mocks.query.mock.calls[0][0]).toContain("for update skip locked");
    expect(mocks.query.mock.calls[0][0]).toContain("resurface_count = state.resurface_count + 1");
    expect(mocks.query.mock.calls[1][0]).toContain("notification_resurfaced");
    expect(mocks.sendPush).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: dueState.user_id,
      eventType: "notification.snooze_expired",
      url: activeSource.actionUrl,
    }));
  });

  it("quietly clears a due state when its authoritative source is already resolved", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [dueState] }).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mocks.source.mockResolvedValue(null);
    const result = await resurfaceDueNotifications(20);
    expect(result).toMatchObject({ ok: true, claimed: 1, resurfaced: 0, sourceResolved: 1, pushSent: 0 });
    expect(mocks.query.mock.calls[1][0]).toContain("source_resolved_before_due");
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
});
