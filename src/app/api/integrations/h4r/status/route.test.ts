import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/env", () => ({ env: { H4R_SMS_BRIDGE_SECRET: "h4r-test-secret-that-is-long-enough" } }));

import { POST } from "./route";

const secret = "h4r-test-secret-that-is-long-enough";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";

function signedRequest(payload: Record<string, unknown> = { workspace_id: workspaceId }) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`, "utf8").digest("hex");
  return new Request("https://ferocity.live/api/integrations/h4r/status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-h4r-timestamp": timestamp,
      "x-h4r-nonce": nonce,
      "x-h4r-signature": `sha256=${signature}`,
    },
    body: rawBody,
  });
}

describe("H4R read-only Ferocity Connect status", () => {
  beforeEach(() => mocks.query.mockReset());

  it("returns isolated health, message history, and prepared replies without sending", async () => {
    const now = new Date();
    mocks.query.mockImplementation((sql: string) => {
      const statement = String(sql ?? "");
      if (statement.includes("returning nonce")) return Promise.resolve({ rows: [{ nonce: "claimed" }] });
      if (statement.includes("from public.h4r_ferocity_bridge_workspaces")) {
        return Promise.resolve({ rows: [{ ferocity_tenant_id: tenantId, status: "review", reply_mode: "review" }] });
      }
      if (statement.includes("from public.ferocity_connect_devices")) {
        return Promise.resolve({ rows: [{ id: "device-1", display_name: "H4R phone", status: "active", app_version: "1.0.1",
          battery_percent: 80, charging: false, network_type: "cellular", last_heartbeat_at: now,
          last_success_at: now, consecutive_failures: 0, updated_at: now }] });
      }
      if (statement.includes("from public.tenant_messaging_accounts")) {
        return Promise.resolve({ rows: [{ connection_status: "connected", credentials_status: "configured",
          live_sending_enabled: true, outbound_enabled: true, emergency_paused: false,
          hourly_send_cap: 30, daily_send_cap: 100, per_recipient_hourly_cap: 2, updated_at: now }] });
      }
      if (statement.includes("from public.ferocity_connect_jobs")) {
        return Promise.resolve({ rows: [{ id: "job-1", message_id: "message-1", recipient: "+17155550199", body: "Reminder",
          status: "delivered", attempt_count: 1, last_error_code: null, last_error_safe: null, created_at: now,
          updated_at: now, sent_at: now, delivered_at: now,
          metadata_json: { h4rSmsOutboxId: "outbox-1", h4rConversationId: "conversation-1" } }] });
      }
      if (statement.includes("direction='inbound'")) return Promise.resolve({ rows: [] });
      if (statement.includes("from public.outbound_action_queue")) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      mode: "read_only",
      bridge: { status: "review", reply_mode: "review", live_sending_authorized: false },
      provider_health: { status: "healthy" },
      outbound_messages: [{ status: "delivered", body: "Reminder" }],
      inbound_messages: [],
      prepared_replies: [],
    });
  });

  it("does not expose a disabled or revoked workspace mapping", async () => {
    mocks.query.mockImplementation((sql: string) => {
      if (String(sql ?? "").includes("returning nonce")) return Promise.resolve({ rows: [{ nonce: "claimed" }] });
      return Promise.resolve({ rows: [] });
    });
    const response = await POST(signedRequest());
    expect(response.status).toBe(403);
  });
});
