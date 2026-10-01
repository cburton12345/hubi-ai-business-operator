import test from "node:test";
import assert from "node:assert/strict";
import { assertMarketplaceWorkerContract } from "../src/worker-contract.js";

test("worker contract rejects an incomplete deployment adapter", () => {
  assert.throws(() => assertMarketplaceWorkerContract({ start() {} }), /missing isRunning/);
});

test("worker contract accepts a deployment-independent adapter", () => {
  const adapter = Object.fromEntries(["isRunning", "start", "stop", "inspectHealth", "collectObservations", "collectCommunitySnapshots", "executeAction"].map((name) => [name, () => {}]));
  assert.equal(assertMarketplaceWorkerContract(adapter), adapter);
});
