import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
vi.mock("@/lib/messaging/messaging-engine", () => ({ sendMessage: mocks.send }));
vi.mock("@/lib/env", () => ({ env: { H4R_SMS_BRIDGE_SECRET: "h4r-test-secret-that-is-long-enough" } }));

import { POST } from "./route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const outboxId = "33333333-3333-4333-8333-333333333333";
const secret = "h4r-test-secret-that-is-long-enough";

function body() {
  return JSON.stringify({
    workspace_id: workspaceId,
    sms_outbox_id: outboxId,
    external_message_id: "h4r-message-0001",
    idempotency_key: "caller-provided-key",
    to: "(715) 555-0199",
    body: "Your payment link is ready.",
    category: "payment_link",
    conversation_id: "conversation-1",
    prospect_id: "prospect-1",
    consent_evidence: {
      status: "granted",
      source: "tenant_service_agreement",
      collected_at: "2026-08-30T12:00:00.000Z",
      marketing_consent: false
    }
  });
}

function signedRequest(rawBody = body(), timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID()) {
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`, "utf8").digest("hex");
  return new Request("https://ferocity.live/api/integrations/h4r/sms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-h4r-timestamp": timestamp,
      "x-h4r-nonce": nonce,
      "x-h4r-signature": `sha256=${signature}`
    },
    body: rawBody
  });
}

function databaseFor(status: "review" | "active") {
  mocks.query.mockImplementation((sql: string) => {
    if (sql.includes("returning nonce")) return Promise.resolve({ rows: [{ nonce: "claimed" }] });
    if (sql.includes("from public.h4r_ferocity_bridge_workspaces")) {
      return Promise.resolve({ rows: [{
        ferocity_tenant_id: tenantId,
        status,
        reply_mode: "review",
        callback_url: "https://h4r.example/functions/v1/ferocity-sms-callback",
        allowed_categories: ["payment_link"],
        metadata_json: {}
      }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe("H4R signed SMS ingress", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.send.mockReset();
  });

  it("rejects stale signed requests before touching the database", async () => {
    const response = await POST(signedRequest(body(), "1"));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not turn review mode into fake human approval", async () => {
    databaseFor("review");
    const response = await POST(signedRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, review_required: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("normalizes the recipient and uses a server-derived idempotency key", async () => {
    databaseFor("active");
    mocks.send.mockResolvedValue({
      ok: true,
      providerKey: "ferocity_connect",
      providerMessageId: "44444444-4444-4444-8444-444444444444",
      status: "queued"
    });
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      to: "+17155550199",
      idempotencyKey: `h4r:${workspaceId}:${outboxId}`,
      authorization: expect.objectContaining({ humanApproved: false, policyAllowsAuto: true }),
      metadata: expect.objectContaining({
        h4rConversationId: "conversation-1",
        h4rProspectId: "prospect-1",
        h4rCallbackUrl: "https://h4r.example/functions/v1/ferocity-sms-callback"
      })
    }));
    const consentCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into public.messaging_consents"));
    expect(consentCall?.[1]?.slice(0, 2)).toEqual([tenantId, "+17155550199"]);
  });
});
