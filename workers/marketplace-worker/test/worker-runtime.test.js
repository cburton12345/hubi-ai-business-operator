import test from "node:test";
import assert from "node:assert/strict";
import { MarketplaceWorkerRuntime } from "../src/worker-runtime.js";

function fixture({ pending = false, observations = [], communities = [], communityDiscoveryEnabled = false } = {}) {
  let now = 1_000_000;
  const calls = [];
  const client = {
    async pendingAction() { calls.push("pending"); return { hasPendingAction: pending }; },
    async claimAction() { calls.push("claim"); pending = false; return { action: { id: "action-1", body: "Hello", sourceUrl: "https://www.facebook.com/messages/t/1" } }; },
    async observe(value) { calls.push(["observe", value]); },
    async observeCommunity(value) { calls.push(["observe-community", value]); },
    async communityDiscoveryPlan() { calls.push("community-plan"); return { searchTerms: ["local business owners"] }; },
    async confirmAction(value) { calls.push(["confirm", value]); },
    async reportHealth(value) { calls.push(["health", value]); }
  };
  let running = false;
  const adapter = {
    isRunning: () => running,
    async start() { calls.push("start"); running = true; },
    async stop() { calls.push("stop"); running = false; },
    async inspectHealth() { return { state: "ready", browserState: running ? "ready" : "closed", url: "https://www.facebook.com/messages/requests", reason: "ok" }; },
    async collectObservations() { calls.push("sweep"); const result = observations; observations = []; return result; },
    async collectCommunitySnapshots() { calls.push("community-sweep"); const result = communities; communities = []; return result; },
    async executeAction(action) { calls.push(["execute", action]); return { outcome: "succeeded", providerReference: "sent-1", observedUrl: action.sourceUrl }; }
  };
  const journalEntries = [];
  const journal = {
    read: () => [...journalEntries],
    begin(action) { journalEntries.splice(0, journalEntries.length, { phase: "executing", action }); },
    complete(action, confirmation) { journalEntries.splice(0, journalEntries.length, { phase: "pending_confirmation", action, confirmation }); },
    remove() { journalEntries.splice(0); }
  };
  const logger = { info() {}, warn() {}, error() {} };
  const config = {
    sendEnabled: true,
    communityDiscoveryEnabled,
    scheduling: { controlPollMs: 20_000, inboundSweepMs: 300_000, communitySweepMs: 21_600_000, idleTimeoutMs: 60_000, healthReportMs: 300_000, manualAttentionTimeoutMs: 1_800_000, restartDelayMs: 10_000, maxRestartDelayMs: 300_000 }
  };
  const runtime = new MarketplaceWorkerRuntime({ client, adapter, journal, logger, config, clock: () => now });
  return { runtime, calls, journalEntries, advance: (ms) => { now += ms; }, setPending: (value) => { pending = value; } };
}

test("approved work wakes the browser, sends once, confirms, and clears the journal", async () => {
  const value = fixture({ pending: true });
  await value.runtime.tick();
  assert.equal(value.calls.filter((call) => call === "start").length, 1);
  assert.equal(value.calls.filter((call) => Array.isArray(call) && call[0] === "execute").length, 1);
  assert.equal(value.calls.filter((call) => Array.isArray(call) && call[0] === "confirm").length, 1);
  assert.equal(value.journalEntries.length, 0);
});

test("scheduled inbound sweep wakes a closed browser and records observations", async () => {
  const observation = { providerEventId: "event-1" };
  const value = fixture({ observations: [observation] });
  await value.runtime.tick();
  assert.ok(value.calls.includes("start"));
  assert.ok(value.calls.includes("sweep"));
  assert.ok(value.calls.some((call) => Array.isArray(call) && call[0] === "observe" && call[1] === observation));
});

test("enabled community sweep records capped group and rules snapshots", async () => {
  const community = { providerEventId: "group-1", name: "Local homeowners" };
  const value = fixture({ communities: [community], communityDiscoveryEnabled: true });
  await value.runtime.tick();
  assert.ok(value.calls.includes("community-sweep"));
  assert.ok(value.calls.includes("community-plan"));
  assert.ok(value.calls.some((call) => Array.isArray(call) && call[0] === "observe-community" && call[1] === community));
});

test("idle timeout closes the browser until new work or the next sweep", async () => {
  const value = fixture();
  await value.runtime.tick();
  value.advance(61_000);
  await value.runtime.tick();
  assert.ok(value.calls.includes("stop"));
});

test("an interrupted action is blocked during recovery instead of resent", async () => {
  const value = fixture();
  value.journalEntries.push({ phase: "executing", action: { id: "uncertain-1" } });
  await value.runtime.recoverJournal();
  const confirmation = value.calls.find((call) => Array.isArray(call) && call[0] === "confirm")?.[1];
  assert.equal(confirmation.outcome, "blocked");
  assert.equal(confirmation.failureCode, "worker_interrupted_during_send");
  assert.equal(value.journalEntries.length, 0);
});
