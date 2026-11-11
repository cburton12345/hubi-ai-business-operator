import { ActionJournal } from "./action-journal.js";
import { ActionPolicyStore } from "./action-policy.js";
import { loadWorkerConfig, resolveConfigPath } from "./config.js";
import { loadConnectorToken } from "./credential-store.js";
import { FacebookPlaywrightAdapter } from "./facebook-playwright-adapter.js";
import { FerocityConnectorClient } from "./ferocity-client.js";
import { createLogger } from "./logger.js";
import { MarketplaceWorkerRuntime } from "./worker-runtime.js";

const config = loadWorkerConfig(resolveConfigPath());
if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({
    ok: true,
    apiBase: config.apiBase,
    runtime: config.runtime,
    deviceIdConfigured: config.deviceId !== "replace-after-pairing",
    profileDir: config.browser.profileDir,
    expectedProfileIdConfigured: Boolean(config.identity.expectedProfileId),
    automationEnabled: config.automationEnabled,
    sendEnabled: config.sendEnabled,
    controlPollSeconds: config.scheduling.controlPollMs / 1000,
    inboundSweepSeconds: config.scheduling.inboundSweepMs / 1000,
    idleTimeoutSeconds: config.scheduling.idleTimeoutMs / 1000
  }, null, 2));
  process.exit(0);
}

const token = loadConnectorToken(config.root);
const logger = createLogger(config.root);
const client = new FerocityConnectorClient({
  apiBase: config.apiBase,
  token,
  deviceId: config.deviceId,
  runtime: config.runtime
});
const adapter = new FacebookPlaywrightAdapter({ ...config.browser, ...config.identity });
const journal = new ActionJournal(config.root);
const actionPolicy = new ActionPolicyStore(config.root, config.actionPolicy);
const runtime = new MarketplaceWorkerRuntime({ client, adapter, journal, actionPolicy, logger, config });
const controller = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => controller.abort());
}

runtime.run(controller.signal).catch((error) => {
  logger.error("Worker stopped unexpectedly.", { error: error.stack || error.message });
  process.exitCode = 1;
});
