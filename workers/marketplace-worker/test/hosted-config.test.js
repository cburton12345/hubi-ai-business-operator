import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadWorkerConfig } from "../src/config.js";

const ENV_KEYS = [
  "FEROCITY_CONNECTOR_RUNTIME", "FEROCITY_CONNECTOR_API_BASE", "FEROCITY_WORKER_ROOT",
  "FEROCITY_FACEBOOK_DEVICE_ID", "FEROCITY_FACEBOOK_DEVICE_NAME", "FEROCITY_FACEBOOK_PROFILE_ID",
  "FEROCITY_FACEBOOK_AUTOMATION_ENABLED", "FEROCITY_FACEBOOK_SEND_ENABLED",
  "FEROCITY_FACEBOOK_DISCOVERY_ENABLED", "FEROCITY_FACEBOOK_HEADLESS",
  "FEROCITY_FACEBOOK_PROFILE_DIR", "FEROCITY_FACEBOOK_KILL_SWITCH_FILE",
  "FEROCITY_FACEBOOK_BROWSER_CHANNEL"
];

function withEnvironment(values, callback) {
  const prior = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try { return callback(); } finally {
    for (const key of ENV_KEYS) {
      if (prior[key] == null) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
}

test("hosted worker accepts secret-manager environment overrides without storing them in config", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ferocity-hosted-worker-"));
  const configPath = path.join(root, "worker.json");
  const stateRoot = path.join(root, "state");
  fs.writeFileSync(configPath, JSON.stringify({
    runtime: "windows_worker", deviceId: "placeholder-device-id", sendEnabled: false,
    communityDiscoveryEnabled: false, browser: { headless: false }, identity: {}
  }));

  const config = withEnvironment({
    FEROCITY_CONNECTOR_RUNTIME: "hosted_worker",
    FEROCITY_WORKER_ROOT: stateRoot,
    FEROCITY_FACEBOOK_DEVICE_ID: "hosted-device-1234567890",
    FEROCITY_FACEBOOK_PROFILE_ID: "61593739891634",
    FEROCITY_FACEBOOK_SEND_ENABLED: "true",
    FEROCITY_FACEBOOK_DISCOVERY_ENABLED: "true",
    FEROCITY_FACEBOOK_HEADLESS: "false"
  }, () => loadWorkerConfig(configPath));

  assert.equal(config.runtime, "hosted_worker");
  assert.equal(config.deviceId, "hosted-device-1234567890");
  assert.equal(config.identity.expectedProfileId, "61593739891634");
  assert.equal(config.sendEnabled, true);
  assert.equal(config.communityDiscoveryEnabled, true);
  assert.equal(config.browser.headless, false);
  assert.equal(config.root, stateRoot);
  assert.equal(config.browser.profileDir, path.join(stateRoot, ".facebook-profile"));
  assert.doesNotMatch(fs.readFileSync(configPath, "utf8"), /61593739891634|hosted-device-1234567890/);
});

test("hosted configuration fails closed for invalid boolean environment values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ferocity-hosted-worker-invalid-"));
  const configPath = path.join(root, "worker.json");
  fs.writeFileSync(configPath, JSON.stringify({
    runtime: "hosted_worker", deviceId: "hosted-device-1234567890",
    identity: { expectedProfileId: "61593739891634" }
  }));
  assert.throws(
    () => withEnvironment({ FEROCITY_FACEBOOK_SEND_ENABLED: "sometimes" }, () => loadWorkerConfig(configPath)),
    /Invalid boolean environment value/
  );
});
