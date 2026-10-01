import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryPostgresMock } = vi.hoisted(() => ({ queryPostgresMock: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: queryPostgresMock }));

import {
  cancelConnectScheduledText,
  ConnectScheduledTextError,
  createConnectScheduledText,
  listConnectScheduledTexts
} from "./scheduled-texts";

describe("Ferocity Connect scheduled texts", () => {
  beforeEach(() => queryPostgresMock.mockReset());

  it("creates a human-approved queue item through the existing Connect provider", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ id: "account" }] })
      .mockResolvedValueOnce({ rows: [{ granted: true, suppressed: false }] })
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }] });
    const scheduledFor = new Date(Date.now() + 60 * 60_000);
    const result = await createConnectScheduledText({
      tenantId: "tenant",
      deviceId: "device",
      recipient: "+17155550199",
      body: "See you tomorrow.",
      scheduledFor,
      deviceTimeZone: "America/Chicago"
    });
    expect(result).toMatchObject({ status: "approved", scheduledFor: scheduledFor.toISOString() });
    expect(queryPostgresMock.mock.calls[2][0]).toContain("'ferocity_connect','approved'");
    expect(queryPostgresMock.mock.calls[2][1][4]).toContain('"approvedFromPairedDevice":true');
  });

  it("refuses to schedule without recorded consent", async () => {
    queryPostgresMock
      .mockResolvedValueOnce({ rows: [{ id: "account" }] })
      .mockResolvedValueOnce({ rows: [{ granted: false, suppressed: false }] });
    await expect(createConnectScheduledText({
      tenantId: "tenant",
      deviceId: "device",
      recipient: "+17155550199",
      body: "Hello",
      scheduledFor: new Date(Date.now() + 60 * 60_000),
      deviceTimeZone: "America/Chicago"
    })).rejects.toEqual(expect.objectContaining<Partial<ConnectScheduledTextError>>({ status: 409 }));
  });

  it("lists only open Connect schedules and serializes their dates", async () => {
    const scheduledFor = new Date(Date.now() + 60 * 60_000);
    queryPostgresMock.mockResolvedValueOnce({ rows: [{
      id: "message", recipient_label: "+17155550199", body: "Hello", status: "approved", scheduled_for: scheduledFor
    }] });
    await expect(listConnectScheduledTexts("tenant")).resolves.toEqual([{
      id: "message", recipient: "+17155550199", body: "Hello", status: "approved", scheduledFor: scheduledFor.toISOString()
    }]);
  });

  it("cancels only an open Connect schedule in the authenticated tenant", async () => {
    queryPostgresMock.mockResolvedValueOnce({ rows: [{ id: "message" }] });
    await cancelConnectScheduledText({ tenantId: "tenant", deviceId: "device", id: "message" });
    expect(queryPostgresMock.mock.calls[0][0]).toContain("tenant_id=$1");
    expect(queryPostgresMock.mock.calls[0][0]).toContain("provider_key='ferocity_connect'");
    expect(queryPostgresMock.mock.calls[0][1].slice(0, 2)).toEqual(["tenant", "message"]);
  });
});
