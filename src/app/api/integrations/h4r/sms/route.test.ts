import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.query }));
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
    contact_controls: {
      sms_stopped: false,
      twilio_sms_stopped: false,
      ferocity_connect_allowed: true
    },
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

function databaseFor(status: "review" | "active", automatic = false) {
  mocks.query.mockImplementation((sql: string, values?: unknown[]) => {
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
    if (sql.includes("from public.live_action_policies")) {
      return Promise.resolve({ rows: automatic ? [{ id: "policy-1", status: "live", requires_human_approval: false }] : [] });
    }
    if (sql.includes("insert into public.outbound_action_queue")) {
      return Promise.resolve({ rows: [{ id: "55555555-5555-4555-8555-555555555555", status: values?.[1] }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe("H4R signed SMS ingress", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("rejects stale signed requests before touching the database", async () => {
    const response = await POST(signedRequest(body(), "1"));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("persists review-mode handoffs without pretending they were approved or sent", async () => {
    databaseFor("review");
    const response = await POST(signedRequest());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, status: "needs_review", review_required: true });
    const queueCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into public.outbound_action_queue"));
    expect(queueCall?.[1]?.[1]).toBe("needs_review");
  });

  it("normalizes the recipient and queues automatic execution only under an explicit live policy", async () => {
    databaseFor("active", true);
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "queued", review_required: false });
    const queueCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into public.outbound_action_queue"));
    expect(queueCall?.[1]?.slice(0, 4)).toEqual([tenantId, "queued", "+17155550199", "Your payment link is ready."]);
    expect(queueCall?.[1]?.[6]).toBe(`h4r:${workspaceId}:${outboxId}`);
    expect(JSON.parse(String(queueCall?.[1]?.[5]))).toMatchObject({
      h4rConversationId: "conversation-1",
      h4rProspectId: "prospect-1",
      h4rCallbackUrl: "https://h4r.example/functions/v1/ferocity-sms-callback"
    });
    const consentCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into public.messaging_consents"));
    expect(consentCall?.[1]?.slice(0, 2)).toEqual([tenantId, "+17155550199"]);
    const canonicalConsentCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into public.contact_consent_records"));
    expect(canonicalConsentCall?.[1]?.slice(0, 2)).toEqual([tenantId, "+17155550199"]);
  });

  it("treats Twilio STOP as provider-specific and still prepares the Ferocity intent", async () => {
    databaseFor("review");
    const payload = JSON.parse(body());
    payload.contact_controls.twilio_sms_stopped = true;
    const response = await POST(signedRequest(JSON.stringify(payload)));
    expect(response.status).toBe(202);
    const queueCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("insert into public.outbound_action_queue"));
    expect(JSON.parse(String(queueCall?.[1]?.[5]))).toMatchObject({
      h4rContactControls: { smsStopped: false, twilioSmsStopped: true, ferocityConnectAllowed: true }
    });
  });

  it.each([
    ["global stop", { sms_stopped: true, twilio_sms_stopped: false, ferocity_connect_allowed: true }, "global_sms_stop"],
    ["Ferocity disabled", { sms_stopped: false, twilio_sms_stopped: false, ferocity_connect_allowed: false }, "ferocity_connect_not_allowed"]
  ])("rejects %s before storing consent or queueing", async (_label, contactControls, blockedBy) => {
    databaseFor("active", true);
    const payload = JSON.parse(body());
    payload.contact_controls = contactControls;
    const response = await POST(signedRequest(JSON.stringify(payload)));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, blocked_by: blockedBy });
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("insert into public.messaging_consents"))).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("insert into public.contact_consent_records"))).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("insert into public.outbound_action_queue"))).toBe(false);
  });
});
