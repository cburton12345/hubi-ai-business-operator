import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ActionPolicyStore } from "../src/action-policy.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ferocity-facebook-policy-"));
  let now = Date.parse("2026-11-09T12:00:00.000Z");
  const policy = new ActionPolicyStore(root, {
    maxGroupJoinsPerDay: 2,
    minimumWriteDelayMs: 45_000,
    maximumWriteDelayMs: 180_000,
    duplicatePostWindowMs: 90 * 24 * 60 * 60 * 1000
  }, () => now);
  return {
    policy,
    advance(milliseconds) { now += milliseconds; },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

test("records successful writes durably and applies bounded pacing", (context) => {
  const value = fixture();
  context.after(value.cleanup);
  value.policy.recordSuccess({ id: "message-1", actionKey: "send_message", body: "Hello", sourceUrl: "https://www.facebook.com/messages/t/1" });
  const decision = value.policy.assess({ id: "message-2", actionKey: "send_message", body: "Follow up" });
  assert.equal(decision.allowed, true);
  assert.ok(decision.waitMs >= 45_000 && decision.waitMs <= 180_000);
});

test("blocks an exact group-post duplicate throughout the configured window", (context) => {
  const value = fixture();
  context.after(value.cleanup);
  value.policy.recordSuccess({ id: "post-1", actionKey: "publish_group_post", body: "Wisconsin contractors wanted" });
  const decision = value.policy.assess({ id: "post-2", actionKey: "publish_group_post", body: "  Wisconsin   contractors WANTED " });
  assert.equal(decision.allowed, false);
  assert.equal(decision.failureCode, "duplicate_group_post");
});

test("blocks group joins after the configured daily cap and resets next UTC day", (context) => {
  const value = fixture();
  context.after(value.cleanup);
  value.policy.recordSuccess({ id: "join-1", actionKey: "request_group_join" });
  value.policy.recordSuccess({ id: "join-2", actionKey: "request_group_join" });
  assert.equal(value.policy.assess({ id: "join-3", actionKey: "request_group_join" }).failureCode, "daily_group_join_limit");
  value.advance(24 * 60 * 60 * 1000);
  assert.equal(value.policy.assess({ id: "join-4", actionKey: "request_group_join" }).allowed, true);
});

test("fails closed for writes when the durable policy journal is corrupted", (context) => {
  const value = fixture();
  context.after(value.cleanup);
  fs.mkdirSync(path.dirname(value.policy.file), { recursive: true });
  fs.writeFileSync(value.policy.file, "not-json", "utf8");
  const decision = value.policy.assess({ id: "message-1", actionKey: "send_message", body: "Hello" });
  assert.equal(decision.allowed, false);
  assert.equal(decision.failureCode, "action_policy_state_invalid");
});
